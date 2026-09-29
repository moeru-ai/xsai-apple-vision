/**
 * Why the on-device model cannot answer now. The last three codes come from
 * the Foundation Models availability of the default model. See ADR-0004.
 */
export type AppleVisionUnavailableCode
  = | 'framework-unavailable'
    | 'device-not-eligible'
    | 'apple-intelligence-not-enabled'
    | 'model-not-ready'

/** A structured-clone-safe reason, so the Electron plugin can send it between processes. */
export interface AppleVisionUnavailableReason {
  code: AppleVisionUnavailableCode
  message: string
}

export type AppleVisionAvailability
  = | { available: true }
    | {
      available: false
      reason: AppleVisionUnavailableReason
    }

/**
 * The built-in Vision tools that the model can call. Both are off by default.
 * A tool call adds a model round and uses part of the context window. See ADR-0009.
 */
export interface AppleVisionBuiltInTools {
  /** `OCRTool`: reads text. The model otherwise guesses small text in a large image. */
  ocr?: boolean
  /** `BarcodeReaderTool`: reads barcodes and QR codes. */
  barcode?: boolean
}
