import Foundation
import Vision

// CI-only image recognition. This helper is deliberately not part of the app target.
guard CommandLine.arguments.count == 3 else {
    fputs("Usage: SignInScreenshot <screenshot.png> <recognized-text.txt>\n", stderr)
    exit(3)
}
let screenshotURL = URL(fileURLWithPath: CommandLine.arguments[1])
let textURL = URL(fileURLWithPath: CommandLine.arguments[2])

do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(url: screenshotURL, options: [:]).perform([request])
    let observations = request.results ?? []
    let text = observations.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    try (text + "\n").write(to: textURL, atomically: true, encoding: .utf8)
    let normalized = text.folding(options: [.diacriticInsensitive, .widthInsensitive],
                                  locale: Locale(identifier: "en_US_POSIX")).lowercased()
    func contains(_ pattern: String) -> Bool {
        normalized.range(of: pattern, options: .regularExpression) != nil
    }
    let signIn = contains("\\bsign\\s*in\\b")
    let email = contains("\\be-?mail\\b")
    let password = contains("\\bpassword\\b")
    let loadError = normalized.contains("forte could not load") ||
        normalized.contains("check your connection and try again")
    let retry = contains("\\bretry\\b")
    if loadError || (retry && !(signIn && email && password)) {
        print("FAIL: native Retry/load-error UI rendered instead of the hosted sign-in form.")
        exit(2)
    }
    guard signIn && email && password else {
        print("WAIT: hosted sign-in markers incomplete (signIn=\(signIn), email=\(email), password=\(password)).")
        exit(1)
    }
    print("PASS: screenshot OCR recognized Sign in, Email, and Password; no native load-error UI.")
} catch {
    fputs("OCR failed: \(error.localizedDescription)\n", stderr)
    exit(3)
}
