"""Re-run prepare-auth-logo.py (navy backdrop + white tagline)."""
import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).parent / "prepare-auth-logo.py"), run_name="__main__")
