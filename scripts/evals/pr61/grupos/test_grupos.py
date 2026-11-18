import importlib.util
from pathlib import Path
import unittest


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


judge = load("juiz-texto")


class GroupTests(unittest.TestCase):
    def test_group_limits_and_duplicates(self):
        for count in (3, 4, 5):
            group = [{"blindId": str(i)} for i in range(count)]
            self.assertEqual(len(judge.read_group({"casos": group})), count)
        for ids in (["a", "b"], list("abcdef"), ["a", "b", "a"]):
            with self.assertRaises(ValueError):
                judge.read_group({"casos": [{"blindId": key} for key in ids]})

    def test_judge_must_explain_every_case_and_ground_next_test(self):
        ids = set("abc")
        rows = [{"blindId": key, "dimensoes": [1, 0], "aprovado": False,
                 "evidencia": "falta o pedido", "correcao": "verificar o pedido"} for key in "abc"]
        verdict = {"casos": rows, "sintese": {"casosAfetados": ["a"], "observacao": "pedido ausente",
                                             "proximoTeste": "conferir o pedido do caso a"}}
        judge.validate(verdict, ids, 2)
        for replacement in ([rows[0], rows[0], rows[2]], rows[:-1], [{**rows[0], "evidencia": ""}, *rows[1:]]):
            with self.assertRaises(ValueError):
                judge.validate({**verdict, "casos": replacement}, ids, 2)
        with self.assertRaises(ValueError):
            judge.validate({**verdict, "sintese": {**verdict["sintese"], "casosAfetados": ["z"]}}, ids, 2)


if __name__ == "__main__":
    unittest.main()
