import Foundation
import FoundationModels
import ImageIO
import Vision
import _Vision_FoundationModels

/// Delivers a JSON value or an error message to the Objective-C++ adapter.
public typealias AppleVisionJSONCallback = @Sendable (NSString?, NSString?) -> Void

/// Delivers the whole text of each stream snapshot to the Objective-C++ adapter.
public typealias AppleVisionSnapshotCallback = @Sendable (NSString) -> Void

/// The availability result that the TypeScript Provider parses. See ADR-0004.
struct AvailabilityPayload: Encodable, Equatable {
    struct Reason: Encodable, Equatable {
        let code: String
        let message: String
    }

    let available: Bool
    let reason: Reason?

    static let available = AvailabilityPayload(available: true, reason: nil)

    static func unavailable(code: String, message: String) -> AvailabilityPayload {
        AvailabilityPayload(available: false, reason: Reason(code: code, message: message))
    }
}

/// Maps the Foundation Models availability of the default model to the reasons of ADR-0004.
func availabilityPayload(for availability: SystemLanguageModel.Availability) -> AvailabilityPayload {
    switch availability {
    case .available:
        return .available
    case .unavailable(.deviceNotEligible):
        return .unavailable(
            code: "device-not-eligible",
            message: "This Mac cannot run Apple Intelligence."
        )
    case .unavailable(.appleIntelligenceNotEnabled):
        return .unavailable(
            code: "apple-intelligence-not-enabled",
            message: "Apple Intelligence is turned off in System Settings."
        )
    case .unavailable(.modelNotReady):
        return .unavailable(
            code: "model-not-ready",
            message: "The on-device model is still downloading or preparing."
        )
    case .unavailable(let reason):
        // A reason that this release does not know yet. ADR-0004 maps it to
        // `framework-unavailable` and keeps the native description.
        return .unavailable(
            code: "framework-unavailable",
            message: String(describing: reason)
        )
    }
}

func encodeJSON(_ value: some Encodable) throws -> NSString {
    let data = try JSONEncoder().encode(value)
    return String(decoding: data, as: UTF8.self) as NSString
}

/// One earlier message of the conversation. Its images come next in the image list.
struct HistoryTurn: Decodable {
    let role: String
    let text: String
    let imageCount: Int
}

/// The built-in Vision tools that the Provider turns on. See ADR-0009.
struct BuiltInTools: Decodable, Equatable {
    var ocr: Bool?
    var barcode: Bool?

    var tools: [any Tool] {
        var tools: [any Tool] = []
        if ocr == true {
            tools.append(OCRTool())
        }
        if barcode == true {
            tools.append(BarcodeReaderTool())
        }
        return tools
    }
}

/// One request after the TypeScript Provider translated the chat-completions body.
///
/// The image list holds the images of every history turn in order, then the
/// images of the prompt.
struct RespondRequest: Decodable {
    let instructions: String?
    let history: [HistoryTurn]
    let prompt: String
    let promptImageCount: Int
    let temperature: Double?
    let maximumResponseTokens: Int?
    let builtInTools: BuiltInTools?
    /// The JSON Schema of `response_format`, as JSON text. See ADR-0005.
    let schemaJSON: String?
}

/// The answer that the TypeScript Provider turns into a chat-completions response.
struct RespondPayload: Encodable, Equatable {
    struct Usage: Encodable, Equatable {
        let promptTokens: Int
        let completionTokens: Int

        init(promptTokens: Int, completionTokens: Int) {
            self.promptTokens = promptTokens
            self.completionTokens = completionTokens
        }

        init(_ usage: LanguageModelSession.Usage) {
            promptTokens = usage.input.totalTokenCount
            completionTokens = usage.output.totalTokenCount
        }
    }

    let text: String
    /// `stop`, or `content_filter` when the guardrails stopped the output. See ADR-0012.
    let finishReason: String
    /// Absent when the model produced no snapshot. See ADR-0013.
    let usage: Usage?
}

/// A failure that the TypeScript Provider turns into a 400 error response.
struct FailurePayload: Encodable, Equatable {
    let code: String
    let message: String
    /// Set only for `context_length_exceeded`. See ADR-0011.
    var contextSize: Int? = nil
    var tokenCount: Int? = nil
}

/// The result of one request: an answer or a failure. Other errors reject the promise.
struct RespondOutcome: Encodable, Equatable {
    var answer: RespondPayload? = nil
    var failure: FailurePayload? = nil
}

/// A generation error that ADR-0011 or ADR-0012 maps to a response.
enum ModelFailure: Equatable {
    /// Only `LanguageModelError` carries the sizes.
    case contextOverflow(contextSize: Int?, tokenCount: Int?)
    case guardrailViolation
    case refusal
    case unsupportedLanguage
}

/// Finds the ADR-0011 and ADR-0012 cases in a generation error. It returns nil for other errors.
func modelFailure(from error: any Error) -> ModelFailure? {
    if let error = error as? LanguageModelError {
        switch error {
        case .contextSizeExceeded(let details):
            return .contextOverflow(contextSize: details.contextSize, tokenCount: details.tokenCount)
        case .guardrailViolation:
            return .guardrailViolation
        case .refusal:
            return .refusal
        case .unsupportedLanguageOrLocale:
            return .unsupportedLanguage
        default:
            return nil
        }
    }
    // NOTICE:
    // The macOS 27.0 SDK declares `LanguageModelError` and deprecates `GenerationError`,
    // but the macOS 27.2 runtime still throws `GenerationError`, measured on 2026-09-29.
    // `GenerationError` carries only a description, so the sizes come from the model.
    // Remove this branch when the oldest supported runtime throws `LanguageModelError`.
    if let error = error as? LanguageModelSession.GenerationError {
        switch error {
        case .exceededContextWindowSize:
            return .contextOverflow(contextSize: nil, tokenCount: nil)
        case .guardrailViolation:
            return .guardrailViolation
        case .refusal:
            return .refusal
        case .unsupportedLanguageOrLocale:
            return .unsupportedLanguage
        default:
            return nil
        }
    }
    return nil
}

/// Describes a context overflow with the image sizes, so the caller can decide how much to shrink them. See ADR-0011.
func contextOverflowPayload(contextSize: Int?, tokenCount: Int?, imageSizes: [String]) -> FailurePayload {
    var message = switch (contextSize, tokenCount) {
    case let (contextSize?, tokenCount?):
        "The request needs \(tokenCount) tokens, but the context window holds \(contextSize)."
    case let (contextSize?, nil):
        "The request does not fit the context window of \(contextSize) tokens."
    default:
        "The request does not fit the context window."
    }
    if !imageSizes.isEmpty {
        let noun = imageSizes.count == 1 ? "image" : "images"
        message += " It has \(imageSizes.count) \(noun): \(imageSizes.joined(separator: ", "))."
    }
    return FailurePayload(
        code: "context_length_exceeded",
        message: message,
        contextSize: contextSize,
        tokenCount: tokenCount
    )
}

/// Maps a model failure to the response of ADR-0011 or ADR-0012.
///
/// A guardrail stop after some output keeps that output as a `content_filter` answer.
func outcome(
    for failure: ModelFailure,
    partialText: String,
    usage: RespondPayload.Usage?,
    imageSizes: [String]
) -> RespondOutcome {
    switch failure {
    case .contextOverflow(let contextSize, let tokenCount):
        return RespondOutcome(failure: contextOverflowPayload(
            contextSize: contextSize,
            tokenCount: tokenCount,
            imageSizes: imageSizes
        ))
    case .guardrailViolation where !partialText.isEmpty:
        return RespondOutcome(answer: RespondPayload(text: partialText, finishReason: "content_filter", usage: usage))
    case .guardrailViolation:
        return RespondOutcome(failure: FailurePayload(
            code: "content_policy_violation",
            message: "The on-device model guardrails rejected the request."
        ))
    case .refusal:
        return RespondOutcome(failure: FailurePayload(
            code: "content_policy_violation",
            message: "The on-device model refused the request."
        ))
    case .unsupportedLanguage:
        return RespondOutcome(failure: FailurePayload(
            code: "unsupported_language",
            message: "The on-device model does not support the language of the request."
        ))
    }
}

enum AppleVisionBridgeError: Error, CustomStringConvertible, Equatable {
    case undecodableImage(index: Int)
    case imageCountMismatch(expected: Int, received: Int)
    case unknownRole(String)

    var description: String {
        switch self {
        case .undecodableImage(let index):
            return "Image \(index + 1) could not be decoded."
        case .imageCountMismatch(let expected, let received):
            return "The request names \(expected) images, but \(received) arrived."
        case .unknownRole(let role):
            return "History role \"\(role)\" is not user or assistant."
        }
    }
}

/// Keywords that only annotate a schema. The SDK drops them, which does not change the output.
let annotationKeywords: Set<String> = ["$schema", "$id", "$comment", "default", "examples", "deprecated", "readOnly", "writeOnly"]

/// Keywords whose value is data, not a schema. Their contents are not keywords.
let valueKeywords: Set<String> = ["enum", "const", "required", "default", "examples", "x-order"]

/// Lists the keyword paths of a JSON Schema, such as `properties.name.format`.
func keywordPaths(of value: Any, at path: [String] = []) -> Set<[String]> {
    var paths = Set<[String]>()
    if let object = value as? [String: Any] {
        for (key, child) in object {
            // The members of `properties` and `$defs` are names, not keywords.
            let namesSchemas = key == "properties" || key == "$defs"
            if !namesSchemas {
                paths.insert(path + [key])
            }
            if valueKeywords.contains(key) {
                continue
            }
            if namesSchemas, let members = child as? [String: Any] {
                for (name, schema) in members {
                    paths.formUnion(keywordPaths(of: schema, at: path + [key, name]))
                }
            } else {
                paths.formUnion(keywordPaths(of: child, at: path + [key]))
            }
        }
    } else if let array = value as? [Any] {
        for (index, child) in array.enumerated() {
            paths.formUnion(keywordPaths(of: child, at: path + [String(index)]))
        }
    }
    return paths
}

/// Decodes a JSON Schema with the SDK decoder. See ADR-0005.
///
/// The SDK decoder drops keywords that it cannot guide, such as `format` or
/// `minLength`, without an error. The output then does not match what the caller
/// asked for, so a dropped keyword fails, except an annotation.
func generationSchema(fromJSON json: String) throws(SchemaError) -> GenerationSchema {
    let data = Data(json.utf8)
    let schema: GenerationSchema
    let input: Any
    let output: Any
    do {
        schema = try JSONDecoder().decode(GenerationSchema.self, from: data)
        input = try JSONSerialization.jsonObject(with: data)
        output = try JSONSerialization.jsonObject(with: JSONEncoder().encode(schema))
    } catch {
        throw SchemaError(message: "The JSON Schema is not supported: \(error)")
    }
    let dropped = keywordPaths(of: input)
        .subtracting(keywordPaths(of: output))
        .filter { !annotationKeywords.contains($0.last!) }
        .sorted { $0.joined(separator: ".") < $1.joined(separator: ".") }
    if let first = dropped.first {
        let location = first.dropLast().joined(separator: ".")
        throw SchemaError(message: "The \"\(first.last!)\" keyword\(location.isEmpty ? "" : " at \(location)") is not supported.")
    }
    return schema
}

struct SchemaError: Error, Equatable {
    let message: String
}

/// Decodes one image with Image I/O. See ADR-0006.
func decodeImage(_ data: Data, index: Int) throws -> CGImage {
    guard
        let source = CGImageSourceCreateWithData(data as CFData, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
        throw AppleVisionBridgeError.undecodableImage(index: index)
    }
    return image
}

/// The session input of one request: the transcript before the prompt, the prompt images,
/// and the pixel size of every image for a context overflow message.
struct SessionInput {
    let transcript: Transcript
    let promptImages: [LabeledImage]
    let imageSizes: [String]
}

/// A decoded image. A tool finds an image by its label, so each image has one when tools are on.
struct LabeledImage {
    let image: CGImage
    let label: String?
}

/// Maps the request to a transcript in the order of the messages. See ADR-0008.
///
/// The instructions come first. Each history turn becomes a prompt entry or a
/// response entry with its text and its images. The prompt is not in the
/// transcript, because the session answers it.
func sessionInput(for request: RespondRequest, images: [Data], labelImages: Bool = false) throws -> SessionInput {
    let expected = request.history.reduce(request.promptImageCount) { $0 + $1.imageCount }
    guard expected == images.count else {
        throw AppleVisionBridgeError.imageCountMismatch(expected: expected, received: images.count)
    }

    var nextImage = 0
    var imageSizes: [String] = []
    func takeImages(_ count: Int) throws -> [LabeledImage] {
        defer { nextImage += count }
        let decoded = try (nextImage..<nextImage + count).map { index in
            LabeledImage(image: try decodeImage(images[index], index: index), label: labelImages ? "image-\(index + 1)" : nil)
        }
        imageSizes += decoded.map { "\($0.image.width)×\($0.image.height)" }
        return decoded
    }

    var entries: [Transcript.Entry] = []
    if let instructions = request.instructions {
        entries.append(.instructions(.init(
            segments: [.text(.init(content: instructions))],
            toolDefinitions: []
        )))
    }
    for turn in request.history {
        var segments: [Transcript.Segment] = turn.text.isEmpty ? [] : [.text(.init(content: turn.text))]
        for image in try takeImages(turn.imageCount) {
            segments.append(.attachment(.init(content: .image(.init(image.image)), label: image.label)))
        }
        switch turn.role {
        case "user":
            entries.append(.prompt(.init(segments: segments)))
        case "assistant":
            entries.append(.response(.init(segments: segments)))
        default:
            throw AppleVisionBridgeError.unknownRole(turn.role)
        }
    }
    let promptImages = try takeImages(request.promptImageCount)
    return SessionInput(
        transcript: Transcript(entries: entries),
        promptImages: promptImages,
        imageSizes: imageSizes
    )
}

/// Compiles the OCR models for this app, so the first OCR tool call does not wait for it. See ADR-0016.
///
/// The Neural Engine runtime compiles them once for each app and system build. A blank
/// image compiles the same three models as the OCR tool, and later calls take less than a second.
func compileOCRModels() async throws {
    let context = CGContext(
        data: nil,
        width: 16,
        height: 16,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: CGColorSpaceCreateDeviceGray(),
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    )!
    context.setFillColor(gray: 1, alpha: 1)
    context.fill(CGRect(x: 0, y: 0, width: 16, height: 16))
    _ = try await RecognizeTextRequest().perform(on: context.makeImage()!)
}

/// The languages of the default model as maximal BCP 47 identifiers, sorted. See ADR-0012.
///
/// A minimal identifier is ambiguous: `zh` means `zh-Hans-CN`, and `zh-TW` means `zh-Hant-TW`.
func supportedLanguageIdentifiers(_ languages: some Collection<Locale.Language>) -> [String] {
    Set(languages.map(\.maximalIdentifier)).sorted()
}

/// Counts the tokens of the whole request with the SDK. It returns nil when counting fails.
func tokenCount(of transcript: Transcript, and prompt: Prompt) async -> Int? {
    let model = SystemLanguageModel.default
    guard
        let transcriptTokens = try? await model.tokenCount(for: transcript),
        let promptTokens = try? await model.tokenCount(for: prompt)
    else {
        return nil
    }
    return transcriptTokens + promptTokens
}

/// Answers one request in its own session. See ADR-0008.
///
/// The session streams even for a request without streaming, so a guardrail stop
/// keeps the text that the model produced before it. See ADR-0012.
/// `onSnapshot` receives the whole text of each snapshot. See ADR-0010.
func answer(
    _ request: RespondRequest,
    images: [Data],
    onSnapshot: (String) -> Void = { _ in }
) async throws -> RespondOutcome {
    let tools = request.builtInTools?.tools ?? []
    var schema: GenerationSchema?
    if let schemaJSON = request.schemaJSON {
        do {
            schema = try generationSchema(fromJSON: schemaJSON)
        } catch {
            return RespondOutcome(failure: FailurePayload(code: "unsupported_request", message: error.message))
        }
    }
    let input: SessionInput
    do {
        input = try sessionInput(for: request, images: images, labelImages: !tools.isEmpty)
    } catch AppleVisionBridgeError.undecodableImage(let index) {
        return RespondOutcome(failure: FailurePayload(
            code: "invalid_image",
            message: AppleVisionBridgeError.undecodableImage(index: index).description
        ))
    }

    let prompt = Prompt {
        request.prompt
        for image in input.promptImages {
            if let label = image.label {
                Attachment(image.image).label(label)
            } else {
                Attachment(image.image)
            }
        }
    }
    let session = LanguageModelSession(tools: tools, transcript: input.transcript)
    let options = GenerationOptions(
        temperature: request.temperature,
        maximumResponseTokens: request.maximumResponseTokens
    )

    var text = ""
    var usage: RespondPayload.Usage?
    do {
        if let schema {
            // A structured snapshot is not a prefix of the next one, so the
            // answer sends only the complete value. See ADR-0010.
            for try await snapshot in session.streamResponse(to: prompt, schema: schema, options: options) {
                text = snapshot.rawContent.jsonString
                usage = RespondPayload.Usage(snapshot.usage)
            }
        } else {
            for try await snapshot in session.streamResponse(to: prompt, options: options) {
                text = snapshot.content
                usage = RespondPayload.Usage(snapshot.usage)
                onSnapshot(text)
            }
        }
        // A cancelled stream ends without an error on macOS 27.2. Without this
        // check, a cancelled answer returns its partial text as a normal answer.
        try Task.checkCancellation()
    } catch {
        guard var failure = modelFailure(from: error) else {
            throw error
        }
        if case .contextOverflow(nil, nil) = failure {
            failure = .contextOverflow(
                contextSize: SystemLanguageModel.default.contextSize,
                tokenCount: await tokenCount(of: input.transcript, and: prompt)
            )
        }
        // A partial structured value does not match the schema, so it is not an answer.
        return outcome(for: failure, partialText: schema == nil ? text : "", usage: usage, imageSizes: input.imageSizes)
    }
    return RespondOutcome(answer: RespondPayload(text: text, finishReason: "stop", usage: usage))
}

/// Cancels one answer and its session. See ADR-0008.
@objc public final class AppleVisionTask: NSObject {
    private let task: Task<Void, Never>

    init(_ task: Task<Void, Never>) {
        self.task = task
    }

    @objc public func cancel() {
        task.cancel()
    }
}

@objc public final class AppleVisionBridge: NSObject {
    @objc public static func isAvailable(completion: @escaping AppleVisionJSONCallback) {
        Task {
            do {
                let payload = availabilityPayload(for: SystemLanguageModel.default.availability)
                completion(try encodeJSON(payload), nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func prepareOCR(completion: @escaping AppleVisionJSONCallback) {
        Task {
            do {
                try await compileOCRModels()
                completion("null", nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func supportedLanguages(completion: @escaping AppleVisionJSONCallback) {
        Task {
            do {
                let identifiers = supportedLanguageIdentifiers(SystemLanguageModel.default.supportedLanguages)
                completion(try encodeJSON(identifiers), nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    /// Uses the SDK match, which accepts a regional variant such as `es-MX` for `es-419`.
    @objc public static func supportsLanguage(identifier: NSString, completion: @escaping AppleVisionJSONCallback) {
        let supported = SystemLanguageModel.default.supportsLocale(Locale(identifier: identifier as String))
        completion(supported ? "true" : "false", nil)
    }

    /// Calls `snapshot` for each stream snapshot, then `completion` once.
    /// A cancelled answer completes with an error.
    @objc public static func respond(
        requestJSON: NSString,
        images: [Data],
        snapshot: AppleVisionSnapshotCallback?,
        completion: @escaping AppleVisionJSONCallback
    ) -> AppleVisionTask {
        let json = requestJSON as String
        return AppleVisionTask(Task {
            do {
                let request = try JSONDecoder().decode(RespondRequest.self, from: Data(json.utf8))
                let payload = try await answer(request, images: images) { text in
                    snapshot?(text as NSString)
                }
                completion(try encodeJSON(payload), nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        })
    }
}

