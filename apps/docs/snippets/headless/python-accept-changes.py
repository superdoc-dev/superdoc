from superdoc import SuperDocClient


def is_successful_receipt(value: object) -> bool:
    return isinstance(value, dict) and value.get("success") is True


with SuperDocClient() as client:
    document = client.open({"doc": "./contract.docx"})

    try:
        receipt = document.track_changes.decide(
            {
                "decision": "accept",
                "target": {"kind": "all"},
            }
        )
        if not is_successful_receipt(receipt):
            raise RuntimeError("Accepting tracked changes failed.")

        document.save(
            {
                "out": "./contract.accepted.docx",
                "force": True,
            }
        )
    finally:
        document.close({"discard": True})
