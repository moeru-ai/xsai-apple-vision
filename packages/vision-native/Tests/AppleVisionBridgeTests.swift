import Foundation
import FoundationModels
import Testing

@testable import AppleVisionBridge

struct AvailabilityPayloadTests {
    @Test func mapsAvailable() {
        #expect(availabilityPayload(for: .available) == .available)
    }

    @Test(arguments: [
        (SystemLanguageModel.Availability.UnavailableReason.deviceNotEligible, "device-not-eligible"),
        (.appleIntelligenceNotEnabled, "apple-intelligence-not-enabled"),
        (.modelNotReady, "model-not-ready"),
    ])
    func mapsUnavailableReasons(reason: SystemLanguageModel.Availability.UnavailableReason, code: String) {
        let payload = availabilityPayload(for: .unavailable(reason))
        #expect(payload.available == false)
        #expect(payload.reason?.code == code)
    }
}

struct SessionInputTests {
    private func request(history: [HistoryTurn], promptImageCount: Int = 0) -> RespondRequest {
        RespondRequest(
            instructions: "Describe screenshots.",
            history: history,
            prompt: "And now?",
            promptImageCount: promptImageCount,
            temperature: nil,
            maximumResponseTokens: nil,
            builtInTools: nil,
            schemaJSON: nil
        )
    }

    private static let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")!

    @Test func labelsEachImageInOrderWhenToolsAreOn() throws {
        let input = try sessionInput(
            for: request(history: [HistoryTurn(role: "user", text: "First", imageCount: 1)], promptImageCount: 1),
            images: [Self.png, Self.png],
            labelImages: true
        )

        let historyLabels = input.transcript.flatMap { entry -> [String?] in
            guard case .prompt(let prompt) = entry else { return [] }
            return prompt.segments.compactMap { segment in
                if case .attachment(let attachment) = segment { return attachment.label }
                return nil
            }
        }
        #expect(historyLabels == ["image-1"])
        #expect(input.promptImages.map(\.label) == ["image-2"])
    }

    @Test func leavesImagesUnlabeledWithoutTools() throws {
        let input = try sessionInput(for: request(history: [], promptImageCount: 1), images: [Self.png])
        #expect(input.promptImages.map(\.label) == [nil])
    }

    @Test func keepsTheMessageOrderInTheTranscript() throws {
        let input = try sessionInput(
            for: request(history: [
                HistoryTurn(role: "user", text: "What is this?", imageCount: 0),
                HistoryTurn(role: "assistant", text: "A menu.", imageCount: 0),
            ]),
            images: []
        )

        let kinds = input.transcript.map { entry -> String in
            switch entry {
            case .instructions: "instructions"
            case .prompt: "prompt"
            case .response: "response"
            default: "other"
            }
        }
        #expect(kinds == ["instructions", "prompt", "response"])
        #expect(input.promptImages.isEmpty)
    }

    @Test func rejectsAnImageCountThatDoesNotMatch() {
        #expect(throws: AppleVisionBridgeError.imageCountMismatch(expected: 1, received: 0)) {
            try sessionInput(for: request(history: [], promptImageCount: 1), images: [])
        }
    }

    @Test func rejectsAnUnknownRole() {
        #expect(throws: AppleVisionBridgeError.unknownRole("tool")) {
            try sessionInput(for: request(history: [HistoryTurn(role: "tool", text: "x", imageCount: 0)]), images: [])
        }
    }
}

struct ModelFailureTests {
    @Test func keepsTheSizesOfALanguageModelContextOverflow() {
        let error = LanguageModelError.contextSizeExceeded(.init(contextSize: 4096, tokenCount: 5000, debugDescription: ""))
        #expect(modelFailure(from: error) == .contextOverflow(contextSize: 4096, tokenCount: 5000))
    }

    @Test(arguments: [
        (LanguageModelError.guardrailViolation(.init(debugDescription: "")), ModelFailure.guardrailViolation),
        (.refusal(.init(explanation: "", debugDescription: "")), .refusal),
        (.unsupportedLanguageOrLocale(.init(languageCode: "cy", debugDescription: "")), .unsupportedLanguage),
    ])
    func mapsLanguageModelErrors(error: LanguageModelError, failure: ModelFailure) {
        #expect(modelFailure(from: error) == failure)
    }

    @Test func mapsTheGenerationErrorThatTheRuntimeThrows() {
        let context = LanguageModelSession.GenerationError.Context(debugDescription: "")
        #expect(modelFailure(from: LanguageModelSession.GenerationError.exceededContextWindowSize(context))
            == .contextOverflow(contextSize: nil, tokenCount: nil))
        #expect(modelFailure(from: LanguageModelSession.GenerationError.guardrailViolation(context)) == .guardrailViolation)
    }

    @Test func ignoresOtherErrors() {
        #expect(modelFailure(from: AppleVisionBridgeError.unknownRole("tool")) == nil)
    }
}

struct OutcomeTests {
    private let usage = RespondPayload.Usage(promptTokens: 10, completionTokens: 2)

    @Test func rejectsAPromptThatTheGuardrailsStopBeforeAnyOutput() {
        let result = outcome(for: .guardrailViolation, partialText: "", usage: nil, imageSizes: [])
        #expect(result.failure?.code == "content_policy_violation")
        #expect(result.answer == nil)
    }

    @Test func keepsTheOutputBeforeAGuardrailStop() {
        let result = outcome(for: .guardrailViolation, partialText: "The window", usage: usage, imageSizes: [])
        #expect(result.answer == RespondPayload(text: "The window", finishReason: "content_filter", usage: usage))
    }

    @Test func describesAContextOverflowWithTheImageSizes() {
        let result = outcome(
            for: .contextOverflow(contextSize: 4096, tokenCount: 5000),
            partialText: "",
            usage: nil,
            imageSizes: ["2880×1800", "1440×900"]
        )
        #expect(result.failure == FailurePayload(
            code: "context_length_exceeded",
            message: "The request needs 5000 tokens, but the context window holds 4096. It has 2 images: 2880×1800, 1440×900.",
            contextSize: 4096,
            tokenCount: 5000
        ))
    }

    @Test func leavesOutATokenCountThatTheSDKCannotGive() {
        let failure = contextOverflowPayload(contextSize: 4096, tokenCount: nil, imageSizes: ["768×768"])
        #expect(failure.message == "The request does not fit the context window of 4096 tokens. It has 1 image: 768×768.")
        #expect(failure.tokenCount == nil)
    }
}

struct BuiltInToolsTests {
    @Test func turnsOnOnlyTheRequestedTools() throws {
        let decode = { (json: String) in try JSONDecoder().decode(BuiltInTools.self, from: Data(json.utf8)).tools.map(\.name) }
        #expect(try decode("{}") == [])
        #expect(try decode(#"{"ocr":true}"#) == ["getText"])
        #expect(try decode(#"{"ocr":true,"barcode":true}"#) == ["getText", "readBarcodes"])
    }
}

struct SupportedLanguageTests {
    @Test func listsMaximalIdentifiersSoChineseScriptsStayApart() {
        let identifiers = supportedLanguageIdentifiers([
            Locale.Language(identifier: "zh"),
            Locale.Language(identifier: "zh-TW"),
            Locale.Language(identifier: "en"),
            Locale.Language(identifier: "en-US"),
        ])
        #expect(identifiers == ["en-Latn-US", "zh-Hans-CN", "zh-Hant-TW"])
    }
}

struct GenerationSchemaTests {
    private func schema(_ property: String) -> String {
        #"{"type":"object","properties":{"a":"# + property + #"},"required":["a"]}"#
    }

    @Test func acceptsTheKeywordsThatTheSDKGuides() throws {
        _ = try generationSchema(fromJSON: schema(#"{"type":"string","enum":["x","y"],"description":"A value"}"#))
        _ = try generationSchema(fromJSON: schema(#"{"type":"array","items":{"type":"integer","minimum":1,"maximum":5},"minItems":1,"maxItems":3}"#))
        _ = try generationSchema(fromJSON: schema(#"{"type":"string","pattern":"^[a-z]+$"}"#))
    }

    @Test func ignoresDroppedAnnotations() throws {
        _ = try generationSchema(fromJSON: #"{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"a":{"type":"string","default":"x","examples":["y"]}},"required":["a"]}"#)
    }

    @Test(arguments: [
        (#"{"type":"string","format":"email"}"#, #"The "format" keyword at properties.a is not supported."#),
        (#"{"type":"string","minLength":2}"#, #"The "minLength" keyword at properties.a is not supported."#),
        (#"{"type":"integer","multipleOf":5}"#, #"The "multipleOf" keyword at properties.a is not supported."#),
    ])
    func rejectsAKeywordThatTheSDKDrops(property: String, message: String) {
        #expect(throws: SchemaError(message: message)) {
            try generationSchema(fromJSON: schema(property))
        }
    }

    @Test(arguments: [
        #"{"type":"object","properties":{"note":{"anyOf":[{"type":"string"},{"type":"null"}]}},"required":["note"]}"#,
        #"{"type":"object","properties":{"value":{"anyOf":[{"type":"string"},{"type":"number"}]}},"required":["value"]}"#,
        #"{"type":"object","properties":{"a":{"anyOf":[{"type":"string"},{"type":"null"}]},"b":{"anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["a","b"]}"#,
        #"{"type":"object","properties":{"shape":{"anyOf":[{"type":"object","properties":{"r":{"type":"number"}},"required":["r"]},{"type":"object","properties":{"w":{"type":"number"}},"required":["w"]}]}},"required":["shape"]}"#,
    ])
    func keepsEachChoiceOfAnAnyOfWithoutATitle(json: String) throws {
        _ = try generationSchema(fromJSON: json)
    }

    @Test func rejectsTwoChoicesThatTheSDKMergesByTitle() {
        #expect(throws: SchemaError.self) {
            try generationSchema(fromJSON: #"{"type":"object","properties":{"a":{"title":"Choice","anyOf":[{"type":"string"},{"type":"null"}]},"b":{"title":"Choice","anyOf":[{"type":"integer"},{"type":"null"}]}},"required":["a","b"]}"#)
        }
    }

    @Test func rejectsASchemaThatTheSDKCannotDecode() {
        #expect(throws: SchemaError.self) {
            try generationSchema(fromJSON: schema(#"{"oneOf":[{"type":"string"},{"type":"integer"}]}"#))
        }
    }
}
