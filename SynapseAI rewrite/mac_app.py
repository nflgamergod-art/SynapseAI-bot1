"""
Native macOS launcher for SynapseAI using a webview window.

This starts the Flask server in a background thread and opens
an embedded WebKit window pointed at http://127.0.0.1:5000.

Requires:
  - pywebview
  - On macOS: pyobjc (provides WebKit bindings)
"""

import platform
import threading
import time
import socket
from urllib.request import urlopen
from urllib.error import URLError


def _run_server():
    # Import the Flask app object and run it directly to avoid opening the OS browser
    from main import app
    # Run the server on localhost:5001
    print("[mac_app] Starting embedded Flask server on http://127.0.0.1:5001 ...")
    # Disable reloader to avoid signal issues in threads
    app.run(debug=False, port=5001, host="127.0.0.1", use_reloader=False)


def _wait_for_server(url: str, timeout: float = 10.0) -> bool:
    """Wait until the HTTP server responds or timeout occurs."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except URLError:
            pass
        except Exception:
            pass
        time.sleep(0.2)
    return False


def _is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.25)
        return s.connect_ex((host, port)) == 0


def main():
    if platform.system() != "Darwin":
        print("This native app wrapper is intended for macOS. On other platforms, run: synapse")
        return

    try:
        import webview
    except Exception as e:
        print("\n❌ Missing dependency: pywebview (and pyobjc on macOS)")
        print("Install with: pip3 install --user pywebview pyobjc\n")
        raise

    # If something else already runs on 5001, just open the window and hope it's our app
    server_started_here = False
    if not _is_port_in_use("127.0.0.1", 5001):
        t = threading.Thread(target=_run_server, daemon=True)
        t.start()
        server_started_here = True

    # Wait a moment for server availability
    if not _wait_for_server("http://127.0.0.1:5001", timeout=12.0) and server_started_here:
        print("\n❌ Failed to start embedded server on http://127.0.0.1:5001")
        print("Check for errors in the server logs or try running: synapse")
        return

    print("\n✅ Server ready at http://127.0.0.1:5001")
    print("Opening native window...")
    print("💡 If the window is blank, a browser tab will open automatically as a fallback.\n")

    # Open a native window to the local app
    window = webview.create_window(
        title="SynapseAI Executor",
        url="http://127.0.0.1:5001",
        width=1100,
        height=750,
        resizable=True,
        confirm_close=True,
    )
    
    # Fallback: open browser after 3 seconds in case embedded window shows blank
    def _browser_fallback():
        import time
        import webbrowser
        time.sleep(3)
        print("🌐 Opening browser fallback at http://127.0.0.1:5001")
        webbrowser.open("http://127.0.0.1:5001")
    
    threading.Thread(target=_browser_fallback, daemon=True).start()
    
    # Start the GUI (devtools disabled to avoid confusion)
    webview.start()


if __name__ == "__main__":
    main()
