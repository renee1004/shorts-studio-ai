"""Read-only NotebookLM adapter. Credentials are never returned or logged."""
import asyncio
import json
import sys
import tempfile
from pathlib import Path


async def read(client, request):
    action = request["action"]
    if action == "notebooks":
        return [{"id": n.id, "title": n.title} for n in await client.notebooks.list()]
    notebook_id = request["notebookId"]
    if action == "items":
        notes = await client.notes.list(notebook_id)
        reports = await client.artifacts.list_reports(notebook_id)
        return ([{"id": n.id, "title": n.title, "kind": "note"} for n in notes]
                + [{"id": r.id, "title": r.title, "kind": "report"}
                   for r in reports if r.is_completed])
    if action != "item":
        raise ValueError("Unsupported read operation")
    item_id = request["itemId"]
    if request["kind"] == "note":
        note = await client.notes.get(notebook_id, item_id)
        return {"notebookId": notebook_id, "itemId": item_id, "kind": "note",
                "title": note.title, "text": note.content}
    if request["kind"] != "report":
        raise ValueError("Unsupported item type")
    reports = await client.artifacts.list_reports(notebook_id)
    report = next(r for r in reports if r.id == item_id and r.is_completed)
    with tempfile.TemporaryDirectory(prefix="notebook-import-") as directory:
        output = Path(directory) / "report.md"
        await client.artifacts.download_report(notebook_id, str(output), artifact_id=item_id)
        # read_bytes avoids Python's universal-newline conversion.
        content = output.read_bytes().decode("utf-8")
    return {"notebookId": notebook_id, "itemId": item_id, "kind": "report",
            "title": report.title, "text": content}


async def main():
    from notebooklm import NotebookLMClient
    request = json.loads(sys.stdin.read(4096))
    async with NotebookLMClient.from_storage(
        sys.argv[1], backend="web", rate_limit_max_retries=0, server_error_max_retries=0
    ) as client:
        return await asyncio.wait_for(read(client, request), timeout=30)


if __name__ == "__main__":
    try:
        result = {"data": asyncio.run(main())}
    except (asyncio.TimeoutError, TimeoutError):
        result = {"error": "timeout"}
    except Exception:
        # Library exceptions can include session details. Never serialize them.
        result = {"error": "unavailable"}
    print(json.dumps(result, ensure_ascii=True))
