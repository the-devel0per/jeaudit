import os
import tempfile

os.environ["JE_GUARD_MODE"] = "local"
os.environ["JE_GUARD_DATA"] = tempfile.mkdtemp()
os.environ.pop("GEMINI_API_KEY", None)
