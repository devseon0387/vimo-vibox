// Vibox · macOS Vision OCR 헬퍼
// 컴파일: swiftc -O scripts/ocr.swift -o scripts/ocr
// 사용:
//   ./ocr <image>                       → 텍스트만
//   ./ocr <image> --json                → [{text, bbox, confidence}]
//   ./ocr --batch <img1> <img2> ...     → JSONL (한 줄씩 {file, items:[...]}) — 여러 이미지 병렬

import Foundation
import Vision
import AppKit

func eprint(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

struct Bbox: Codable {
    let x: Double, y: Double, w: Double, h: Double
}
struct Item: Codable {
    let text: String
    let bbox: Bbox
    let confidence: Float
}
struct FileResult: Codable {
    let file: String
    let items: [Item]
}

func processImage(path: String) -> [Item] {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        return []
    }
    let req = VNRecognizeTextRequest()
    req.recognitionLanguages = ["ko-KR", "en-US"]
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { return [] }

    var out: [Item] = []
    for obs in (req.results ?? []) {
        guard let c = obs.topCandidates(1).first else { continue }
        let t = c.string.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { continue }
        let b = obs.boundingBox
        let topY = 1.0 - (b.origin.y + b.height)
        out.append(Item(
            text: t,
            bbox: Bbox(
                x: Double(b.origin.x),
                y: Double(topY),
                w: Double(b.width),
                h: Double(b.height)
            ),
            confidence: c.confidence
        ))
    }
    out.sort { $0.bbox.y < $1.bbox.y }
    return out
}

let args = CommandLine.arguments
guard args.count > 1 else {
    eprint("Usage: ocr <image> [--json] | --batch <img1> <img2> ...")
    exit(2)
}

// 배치 모드: concurrentPerform으로 CPU 코어 최대 활용
if args[1] == "--batch" {
    let files = Array(args.dropFirst(2))
    let encoder = JSONEncoder()
    let resultsLock = NSLock()
    var resultsMap: [Int: String] = [:]

    DispatchQueue.concurrentPerform(iterations: files.count) { i in
        let items = processImage(path: files[i])
        let result = FileResult(file: files[i], items: items)
        if let data = try? encoder.encode(result),
           let s = String(data: data, encoding: .utf8) {
            resultsLock.lock()
            resultsMap[i] = s
            resultsLock.unlock()
        }
    }

    // 순서대로 출력 (파일명 순서 유지)
    for i in 0..<files.count {
        if let s = resultsMap[i] {
            print(s)
        }
    }
    exit(0)
}

// 단일 모드 (기존 호환)
let path = args[1]
let jsonMode = args.contains("--json")
let items = processImage(path: path)

if jsonMode {
    let encoder = JSONEncoder()
    let data = try encoder.encode(items)
    print(String(data: data, encoding: .utf8) ?? "[]")
} else {
    print(items.map { $0.text }.joined(separator: "\n"))
}
