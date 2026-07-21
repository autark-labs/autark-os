#!/usr/bin/env python3

import copy
import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, RefResolver


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "docs" / "pro" / "contracts"
OPENAPI = ROOT / "docs" / "pro" / "openapi"
EXAMPLE_NAMES = (
    "device-registration-request-v1",
    "device-registration-challenge-v1",
    "device-operation-challenge-v1",
    "durable-product-grant-v1",
    "online-service-lease-v1",
    "pro-entitlement-status-v1",
    "pro-release-manifest-v1",
    "agent-status-v1",
    "normalized-host-snapshot-v1",
    "extension-ui-manifest-v1",
    "extension-surface-response-v1",
)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    store = {}
    schemas = {}
    for path in sorted(CONTRACTS.glob("*.schema.json")):
        schema = load_json(path)
        Draft202012Validator.check_schema(schema)
        schemas[path.stem.removesuffix(".schema")] = (path, schema)
        store[schema["$id"]] = schema
        store[path.as_uri()] = schema

    validators = {}
    for name in EXAMPLE_NAMES:
        path, schema = schemas[name]
        validator = Draft202012Validator(
            schema,
            resolver=RefResolver(base_uri=path.as_uri(), referrer=schema, store=store),
        )
        validators[name] = validator
        validator.validate(load_json(CONTRACTS / "examples" / f"{name}.json"))

    invalid_capability = load_json(
        CONTRACTS / "examples" / "durable-product-grant-v1.json"
    )
    invalid_capability["features"][0] = "INVALID CAPABILITY"
    if validators["durable-product-grant-v1"].is_valid(invalid_capability):
        raise SystemExit("invalid opaque capability unexpectedly passed validation")

    invalid_mutation = copy.deepcopy(
        load_json(
            CONTRACTS
            / "examples"
            / "normalized-host-snapshot-v1.json"
        )
    )
    invalid_mutation["recentMutations"][0]["method"] = "GET"
    if validators["normalized-host-snapshot-v1"].is_valid(
        invalid_mutation
    ):
        raise SystemExit(
            "read-only mutation envelope unexpectedly passed schema validation"
        )

    request_path, request_schema = schemas["extension-surface-request-v1"]
    request_validator = Draft202012Validator(
        request_schema,
        resolver=RefResolver(
            base_uri=request_path.as_uri(),
            referrer=request_schema,
            store=store,
        ),
    )
    request_validator.validate({
        "schemaVersion": "1",
        "surface": "storage.insights",
        "snapshot": load_json(
            CONTRACTS / "examples" / "normalized-host-snapshot-v1.json"
        ),
        "continuationToken": None,
    })

    for path in sorted(OPENAPI.glob("*.yaml")):
        document = yaml.safe_load(path.read_text(encoding="utf-8"))
        if document.get("openapi") != "3.1.0":
            raise SystemExit(f"{path.name} is not OpenAPI 3.1.0")
        if not document.get("paths"):
            raise SystemExit(f"{path.name} has no paths")

    print(
        f"Validated {len(EXAMPLE_NAMES)} Pro examples, "
        f"{len(schemas)} JSON Schemas, and "
        f"{len(tuple(OPENAPI.glob('*.yaml')))} OpenAPI documents."
    )


if __name__ == "__main__":
    main()
