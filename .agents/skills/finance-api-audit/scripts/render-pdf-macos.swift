// Автономный fallback для macOS: PDF и PNG-проверка без сети и сторонних пакетов.
import Foundation
import AppKit
import CoreText
import CoreGraphics
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(2)
}
guard CommandLine.arguments.count == 2 else { fail("Укажите путь к обезличенному report.json") }
let input = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
let output = input.deletingPathExtension().appendingPathExtension("pdf")
guard !FileManager.default.fileExists(atPath: output.path) else { fail("PDF уже существует; перезапись запрещена") }
guard let data = try? Data(contentsOf: input),
      let report = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let sources = report["sources"] as? [[String: Any]],
      let findings = report["findings"] as? [[String: Any]],
      let summary = report["summary"] as? [String: Any],
      let reference = report["reference"] as? [String: Any] else { fail("Неверный формат report.json") }
let text = NSMutableAttributedString()
let green = NSColor(red: 0.086, green: 0.388, blue: 0.302, alpha: 1)
func string(_ value: Any?) -> String {
    guard let value, !(value is NSNull) else { return "не указано" }
    return String(describing: value)
}
func append(_ value: String, title: Bool = false, heading: Bool = false, small: Bool = false) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.lineSpacing = small ? 2 : 3
    paragraph.paragraphSpacing = title ? 16 : (heading ? 8 : 7)
    paragraph.paragraphSpacingBefore = heading ? 12 : 0
    let size: CGFloat = title ? 23 : (heading ? 13 : (small ? 8.5 : 10))
    let font = NSFont(name: (title || heading) ? "Arial-BoldMT" : "ArialMT", size: size) ?? NSFont.systemFont(ofSize: size)
    let color = (title || heading) ? green : NSColor(calibratedWhite: small ? 0.34 : 0.16, alpha: 1)
    text.append(NSAttributedString(string: value + "\n", attributes: [.font: font, .foregroundColor: color, .paragraphStyle: paragraph, NSAttributedString.Key("auditHeading"): heading]))
}
append("Аудит финансовых API", title: true)
let iso = ISO8601DateFormatter()
iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
if let date = iso.date(from: string(report["checkedAt"])) {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "ru_RU")
    formatter.timeZone = TimeZone(identifier: "Europe/Moscow")
    formatter.dateStyle = .long; formatter.timeStyle = .medium
    append("Проверено: " + formatter.string(from: date) + " МСК")
}
append("UTC: " + string(report["checkedAt"]), small: true)
append(report["mode"] as? String == "live" ? "Источник: текущие ответы серверов." : "Источник: локальный снимок / тестовые данные.")
append("Полнота: " + ((report["complete"] as? Bool == true) ? "все источники получены; ограничения объёма и справочника не обнаружены." : "ограничена; см. замечания."))
append("Групп ошибок совместимости: \(string(summary["error"])). Групп предупреждений: \(string(summary["warning"])).")
append("Ошибки означают несовместимость с текущим клиентом. Без согласованной спецификации это не всегда доказанный дефект backend. Секретные заголовки, ID и полные записи в отчёт не включены.")
append("Источники и объём проверки", heading: true)
append("Продажи: cpa-server-vtel.onrender.com/api/finance1 и /api/finance2. Курсы: open.er-api.com/v6/latest/USD.", small: true)
for source in sources {
    let name = string(source["name"])
    if name == "rates" { append("rates: HTTP \(string(source["status"])); проверяется ответ курсов, число продаж не применимо.", small: true) }
    else { append("\(name): HTTP \(string(source["status"])); записей \(string(source["records"])); проверено \(string(source["checked"])); учтённых продаж \(string(source["paid"])).", small: true) }
}
if let currencies = report["currencies"] as? [String] { append("Коды в выборке: " + currencies.joined(separator: ", ")) }
append("Замечания backend-разработчикам", heading: true)
if findings.isEmpty { append("В проверенном снимке перечисленные проверки не выявили замечаний. Это не подтверждает другие даты или сценарии.") }
for (index, item) in findings.enumerated() {
    append("\(index + 1). \(string(item["title"]))", heading: true)
    let level = item["severity"] as? String == "error" ? "Ошибка совместимости" : "Предупреждение"
    append("\(level). Источник: \(string(item["source"])). Правило: \(string(item["rule"])). Срабатываний: \(string(item["count"])).", small: true)
    append("Влияние: " + string(item["impact"]))
    append("Рекомендация: " + string(item["recommendation"]))
    if let examples = item["examples"] as? [[String: Any]] {
        for example in examples { append(string(example["path"]) + ": " + string(example["evidence"]), small: true) }
    }
}
append("Что согласовать в контракте", heading: true)
append("Список статусов; канонический регистр кодов валют; точность сумм и возвраты. У finance2 уточнить необходимость ID, статуса и даты: строковые записи не позволяют надёжно проверить дубли и период.")
append("Справочник и ограничения", heading: true)
append("SIX / ISO 4217: публикация \(string(reference["publishedAt"])); получен \(string(reference["retrievedAt"])).", small: true)
append(string(reference["source"]), small: true)
append("Код вне текущего списка ISO может быть историческим или внутренним. Отсутствие курса не доказывает отсутствия валюты. Два знака после точки - ограничение клиента, а не всех валют мира. Аудит отражает один снимок и не изменяет сервер или приложение.")
append("Перед передачей проверьте право получателя видеть приведённые минимальные примеры.", small: true)
var media = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
guard let context = CGContext(output as CFURL, mediaBox: &media, nil) else { fail("Не удалось создать PDF") }
let framesetter = CTFramesetterCreateWithAttributedString(text)
let box = CGRect(x: 48, y: 48, width: media.width - 96, height: media.height - 96)
var offset = 0
var pages = 0
while offset < text.length {
    pages += 1
    context.beginPDFPage(nil)
    let path = CGPath(rect: box, transform: nil)
    var frame = CTFramesetterCreateFrame(framesetter, CFRange(location: offset, length: 0), path, nil)
    // Не оставляем заголовок без хотя бы нескольких строк следующего текста.
    let lines = CTFrameGetLines(frame) as! [CTLine]
    for line in lines.suffix(3) {
        let location = CTLineGetStringRange(line).location
        if location < text.length, text.attribute(NSAttributedString.Key("auditHeading"), at: location, effectiveRange: nil) as? Bool == true {
            let paragraph = (text.string as NSString).paragraphRange(for: NSRange(location: location, length: 0))
            if paragraph.location > offset {
                frame = CTFramesetterCreateFrame(framesetter, CFRange(location: offset, length: paragraph.location-offset), path, nil)
                break
            }
        }
    }
    CTFrameDraw(frame, context)
    let visible = CTFrameGetVisibleStringRange(frame)
    guard visible.length > 0 else { fail("Текст не помещается в область страницы") }
    offset += visible.length
    let footer = NSAttributedString(string: "Сводка | аудит API                         \(pages)", attributes: [.font: NSFont.systemFont(ofSize: 8), .foregroundColor: NSColor.gray])
    context.textPosition = CGPoint(x: 48, y: 25)
    CTLineDraw(CTLineCreateWithAttributedString(footer), context)
    context.endPDFPage()
}
context.closePDF()
try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: output.path)
guard let pdf = CGPDFDocument(output as CFURL), pdf.numberOfPages == pages else { fail("Не удалось проверить страницы созданного PDF") }
let previews = input.deletingLastPathComponent().appendingPathComponent("pdf-preview")
try FileManager.default.createDirectory(at: previews, withIntermediateDirectories: true)
for number in 1...pdf.numberOfPages {
    guard let page = pdf.page(at: number) else { fail("Нет страницы PDF") }
    let bounds = page.getBoxRect(.mediaBox)
    let scale: CGFloat = 1.5
    let w = Int(bounds.width * scale), h = Int(bounds.height * scale)
    guard let bitmap = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("Нет контекста рендера") }
    bitmap.setFillColor(CGColor(gray: 1, alpha: 1)); bitmap.fill(CGRect(x:0,y:0,width:w,height:h))
    bitmap.scaleBy(x: scale, y: scale); bitmap.drawPDFPage(page)
    guard let image = bitmap.makeImage(), let destination = CGImageDestinationCreateWithURL(previews.appendingPathComponent(String(format: "page-%02d.png", number)) as CFURL, "public.png" as CFString, 1, nil) else { fail("Не удалось сохранить PNG") }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fail("Ошибка записи PNG") }
}
print("PDF сохранён; страниц: \(pages). Превью: \(previews.path)")
