import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock
from notebooklm_bridge import read


class ReadOnlyBridgeTests(unittest.IsolatedAsyncioTestCase):
    def client(self):
        # Deliberately no chat/research/generate/delete methods available.
        return SimpleNamespace(
            notebooks=SimpleNamespace(list=AsyncMock(return_value=[SimpleNamespace(id="book", title="자료") ])),
            notes=SimpleNamespace(list=AsyncMock(return_value=[SimpleNamespace(id="note", title="대본")]),
                                  get=AsyncMock(return_value=SimpleNamespace(id="note", title=" 대본 ", content=" \r\n# 제목\r\n\r\n문장  \n"))),
            artifacts=SimpleNamespace(list_reports=AsyncMock(return_value=[
                SimpleNamespace(id="report", title="보고서", is_completed=True),
                SimpleNamespace(id="pending", title="미완성", is_completed=False)]),
                download_report=AsyncMock()))

    async def test_notebooks_and_saved_items_only(self):
        client = self.client()
        self.assertEqual(await read(client, {"action": "notebooks"}), [{"id": "book", "title": "자료"}])
        items = await read(client, {"action": "items", "notebookId": "book"})
        self.assertEqual([item["id"] for item in items], ["note", "report"])

    async def test_note_whitespace_is_exact(self):
        result = await read(self.client(), {"action": "item", "notebookId": "book", "itemId": "note", "kind": "note"})
        self.assertEqual(result["text"], " \r\n# 제목\r\n\r\n문장  \n")
        self.assertEqual(result["title"], " 대본 ")

    async def test_report_bytes_preserve_crlf_and_temporary_file_removed(self):
        client = self.client()
        paths = []
        async def download(book, output, *, artifact_id):
            self.assertEqual((book, artifact_id), ("book", "report"))
            paths.append(Path(output))
            Path(output).write_bytes("# 보고서\r\n\r\n원문  \r\n".encode("utf-8"))
        client.artifacts.download_report.side_effect = download
        result = await read(client, {"action": "item", "notebookId": "book", "itemId": "report", "kind": "report"})
        self.assertEqual(result["text"], "# 보고서\r\n\r\n원문  \r\n")
        self.assertFalse(paths[0].exists())

    async def test_non_read_action_rejected(self):
        with self.assertRaises(ValueError):
            await read(self.client(), {"action": "generate", "notebookId": "book"})

    async def test_unfinished_report_not_downloaded(self):
        client = self.client()
        with self.assertRaises(RuntimeError):
            await read(client, {"action": "item", "notebookId": "book", "itemId": "pending", "kind": "report"})
        client.artifacts.download_report.assert_not_called()


if __name__ == "__main__":
    unittest.main()
