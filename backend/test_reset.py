#!/usr/bin/env python3
import json

# Test that our fix works
view_def = {
    "include_types": ["all"],
    "exclude_types": [],
    "include_account_ids": [],
    "exclude_account_ids": [],
    "exclude_liabilities": False,
}

# This is what we do in the code
result = view_def if isinstance(view_def, str) else json.dumps(view_def)
print("✅ Dictionary successfully serialized to JSON:")
print(result)
print("")
print("Type:", type(result))
print("Valid JSON:", json.loads(result))
