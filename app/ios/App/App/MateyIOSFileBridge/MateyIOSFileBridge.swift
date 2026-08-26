import Capacitor
import Foundation

@objc(MateyIOSFileBridge)
public class MateyIOSFileBridge: CAPPlugin {

    @objc func readFile(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        let encoding = call.options()?["encoding"] as? String ?? "utf8"

        do {
            let data = try readSandboxFile(at: path)
            let content: String
            if encoding == "base64" {
                content = data.base64EncodedString()
            } else {
                content = String(data: data, encoding: .utf8) ?? ""
            }
            call.resolve(["content": content, "success": true])
        } catch {
            call.reject("Failed to read file: \(error.localizedDescription)", nil, error)
        }
    }

    @objc func writeFile(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""
        let content = call.getString("content") ?? ""
        let encoding = call.options()?["encoding"] as? String ?? "utf8"

        do {
            let data: Data
            if encoding == "base64" {
                data = Data(base64Encoded: content) ?? Data()
            } else {
                data = content.data(using: .utf8) ?? Data()
            }
            try writeSandboxFile(at: path, data: data)
            call.resolve(["success": true, "path": path])
        } catch {
            call.reject("Failed to write file: \(error.localizedDescription)", nil, error)
        }
    }

    @objc func listFiles(_ call: CAPPluginCall) {
        let subDir = call.getString("subDir") ?? ""

        do {
            let files = try listSandboxDirectory(at: subDir)
            call.resolve(["files": files, "success": true])
        } catch {
            call.reject("Failed to list files: \(error.localizedDescription)", nil, error)
        }
    }

    @objc func deleteFile(_ call: CAPPluginCall) {
        let path = call.getString("path") ?? ""

        do {
            try deleteSandboxFile(at: path)
            call.resolve(["success": true])
        } catch {
            call.reject("Failed to delete file: \(error.localizedDescription)", nil, error)
        }
    }

    private func sandboxBaseURL() throws -> URL {
        guard let urls = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw NSError(domain: "MateyIOSFileBridge", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot find documents directory"])
        }
        return urls
    }

    private func readSandboxFile(at path: String) throws -> Data {
        let base = try sandboxBaseURL()
        let fileURL = base.appendingPathComponent(path)
        return try Data(contentsOf: fileURL)
    }

    private func writeSandboxFile(at path: String, data: Data) throws {
        let base = try sandboxBaseURL()
        let fileURL = base.appendingPathComponent(path)
        let dirURL = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true, attributes: nil)
        try data.write(to: fileURL, options: .atomic)
    }

    private func listSandboxDirectory(at subDir: String) throws -> [[String: Any]] {
        let base = try sandboxBaseURL()
        let dirURL = subDir.isEmpty ? base : base.appendingPathComponent(subDir)
        let contents = try FileManager.default.contentsOfDirectory(at: dirURL, includingPropertiesForKeys: [.isRegularFileKey, .isDirectoryKey], options: .skipsHiddenFiles)
        return contents.map { url in
            let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            let name = url.lastPathComponent
            let relPath = subDir.isEmpty ? name : "\(subDir)/\(name)"
            return [
                "name": name,
                "path": relPath,
                "type": isDir ? "directory" : "file"
            ] as [String: Any]
        }
    }

    private func deleteSandboxFile(at path: String) throws {
        let base = try sandboxBaseURL()
        let fileURL = base.appendingPathComponent(path)
        try FileManager.default.removeItem(at: fileURL)
    }
}
