"""Unit tests for Mem0 semantic memory integration in Bedo runtime."""

from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

RUNTIME_DIR = Path(__file__).resolve().parent.parent / "electron" / "bedo-runtime"
if str(RUNTIME_DIR) not in sys.path:
    sys.path.insert(0, str(RUNTIME_DIR))

from memory import mem0_layer, memory_manager  # noqa: E402
from actions import rag  # noqa: E402


class _FakeMem0Client:
    def __init__(self):
        self.items: list[dict] = []
        self._seq = 0

    def add(self, data, user_id="default", metadata=None, infer=True):
        self._seq += 1
        if isinstance(data, list):
            text = " ".join(m.get("content", "") for m in data if m.get("role") == "user").strip()
        else:
            text = str(data).strip()
        entry = {
            "id": f"m_{self._seq}",
            "memory": text,
            "metadata": metadata or {},
            "user_id": user_id,
        }
        self.items.append(entry)
        return {"results": [entry]}

    def search(self, query, user_id="default", limit=5):
        q = query.lower()
        hits = []
        for it in self.items:
            if any(tok in it["memory"].lower() for tok in q.split() if len(tok) >= 3):
                hits.append({**it, "score": 0.88})
        return {"results": hits[:limit]}

    def get_all(self, user_id="default", limit=20):
        return {"results": list(self.items[:limit])}

    def delete(self, memory_id):
        self.items = [it for it in self.items if it["id"] != memory_id]
        return {"ok": True}


class Mem0IntegrationTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._orig_mem_file = memory_manager.MEMORY_FILE
        memory_manager.MEMORY_FILE = Path(self._tmp.name) / "memory.json"
        mem0_layer.reset_mem0_client()
        mem0_layer._LAST_TURN_SIG = ""

    def tearDown(self):
        memory_manager.MEMORY_FILE = self._orig_mem_file
        mem0_layer.reset_mem0_client()
        self._tmp.cleanup()

    def test_graceful_degradation_when_mem0_disabled(self):
        with mock.patch.dict(os.environ, {"BEDO_DISABLE_MEM0": "1"}):
            self.assertFalse(mem0_layer.is_mem0_available())
            memory_manager.update_memory({"preferences": {"coffee": {"value": "sade filtre kahve"}}})
            loaded = memory_manager.load_memory()
            self.assertEqual(loaded["preferences"]["coffee"]["value"], "sade filtre kahve")
            res = memory_manager.search_memory("filtre kahve")
            self.assertIn("sade filtre kahve", res)
            prompt_block = memory_manager.format_memory_for_prompt(loaded)
            self.assertIn("[KULLANICI HAKKINDA BİLGİLER]", prompt_block)

    def test_mem0_turn_extraction_search_prompt_and_delete(self):
        fake = _FakeMem0Client()
        with (
            mock.patch.object(mem0_layer, "MEM0_SDK_AVAILABLE", True),
            mock.patch.object(mem0_layer, "_get_client", return_value=fake),
            mock.patch.object(mem0_layer, "is_mem0_available", return_value=True),
        ):
            # Trivial turn should be skipped
            self.assertFalse(mem0_layer.record_conversation_turn_async("tamam", "Rica ederim"))

            # Meaningful turn should be enqueued and processed by background worker
            ok = memory_manager.remember_conversation_turn(
                "Ben sabahları filtre kahve içerim ve Python ile Electron geliştiriyorum",
                "Not aldım, kahve ve geliştirme tercihlerini hatırlayacağım.",
            )
            self.assertTrue(ok)
            mem0_layer._WRITE_QUEUE.join()
            self.assertEqual(len(fake.items), 1)

            # Semantic search via memory_manager
            search_out = memory_manager.search_memory("sabah kahve")
            self.assertIn("filtre kahve", search_out)

            # Semantic memories injected into system prompt
            prompt_text = memory_manager.format_memory_for_prompt({}, include_semantic=True)
            self.assertIn("[ÖĞRENİLMİŞ SEMANTİK HAFIZA]", prompt_text)
            self.assertIn("filtre kahve", prompt_text)

            # RAG memory scope blends semantic results
            rag_out = rag.local_rag_query("filtre kahve", scope="memory")
            self.assertIn("[Hafıza]", rag_out)
            self.assertIn("filtre kahve", rag_out)

            # Deleting from memory removes semantic record too
            del_msg = memory_manager.delete_memory(match_text="filtre kahve")
            self.assertIn("Semantik hafizadan", del_msg)
            self.assertEqual(len(fake.items), 0)

    def test_config_separates_qdrant_paths_by_provider(self):
        prov_g, cfg_g = mem0_layer._build_mem0_config({"gemini": "AIza_fake", "openai": "", "anthropic": ""}, discover=False)
        self.assertEqual(prov_g, "gemini")
        self.assertEqual(cfg_g["llm"]["config"]["model"], "gemini-4-hydrogen")
        self.assertEqual(cfg_g["vector_store"]["config"]["embedding_model_dims"], 768)
        self.assertTrue(cfg_g["vector_store"]["config"]["on_disk"])

        prov_o, cfg_o = mem0_layer._build_mem0_config({"gemini": "", "openai": "sk-fake", "anthropic": ""}, discover=False)
        self.assertEqual(prov_o, "openai")
        self.assertEqual(cfg_o["llm"]["config"]["model"], "gpt-6-sol")
        self.assertEqual(cfg_o["vector_store"]["config"]["embedding_model_dims"], 1536)

        prov_c, cfg_c = mem0_layer._build_mem0_config({"gemini": "", "openai": "", "anthropic": "sk-ant-fake"}, discover=False)
        self.assertEqual(prov_c, "claude")
        self.assertEqual(cfg_c["llm"]["provider"], "anthropic")
        self.assertEqual(cfg_c["llm"]["config"]["model"], "claude-haiku-5-5")
        self.assertEqual(cfg_c["embedder"]["provider"], "fastembed")
        self.assertEqual(cfg_c["vector_store"]["config"]["embedding_model_dims"], 384)
        self.assertEqual(
            len({
                cfg_g["vector_store"]["config"]["path"],
                cfg_o["vector_store"]["config"]["path"],
                cfg_c["vector_store"]["config"]["path"],
            }),
            3,
        )


if __name__ == "__main__":
    unittest.main()
