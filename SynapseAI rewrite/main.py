from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
from executor import RobloxExecutor
from script_hub import ScriptHub

app = Flask(__name__)
CORS(app)

# Initialize backend
executor = RobloxExecutor()
script_hub = ScriptHub()

@app.route('/')
def index():
    """Serve the main page"""
    return render_template('index.html')

@app.route('/api/inject', methods=['POST'])
def inject():
    """Inject into Roblox process"""
    success, message = executor.inject()
    return jsonify({
        'success': success,
        'message': message,
        'injected': executor.is_injected()
    })

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get injection status"""
    return jsonify({
        'injected': executor.is_injected(),
        'info': executor.get_roblox_info()
    })

@app.route('/api/execute', methods=['POST'])
def execute():
    """Execute a script"""
    data = request.get_json()
    script = data.get('script', '')
    
    if not executor.is_injected():
        return jsonify({
            'success': False,
            'message': 'Not injected into Roblox'
        })
    
    if not script.strip():
        return jsonify({
            'success': False,
            'message': 'Script is empty'
        })
    
    success, message = executor.execute(script)
    return jsonify({
        'success': success,
        'message': message
    })

@app.route('/api/scripts', methods=['GET'])
def get_scripts():
    """Get all scripts from the hub"""
    scripts = script_hub.get_all_scripts()
    return jsonify(scripts)

@app.route('/api/scripts/save', methods=['POST'])
def save_script():
    """Save a new script to the hub"""
    data = request.get_json()
    name = data.get('name', '')
    content = data.get('content', '')
    description = data.get('description', '')
    
    if not name or not content:
        return jsonify({
            'success': False,
            'message': 'Name and content are required'
        })
    
    success = script_hub.add_script(name, content, description)
    return jsonify({
        'success': success,
        'message': 'Script saved successfully' if success else 'Failed to save script'
    })

def main():
    """Main entry point for the application"""
    print("\n" + "="*60)
    print("🚀 SynapseAI Executor - Web Edition")
    print("="*60)
    print("\n📱 Opening in your browser at: http://localhost:5000")
    print("\n⚠️  Make sure Roblox is running before injecting!")
    print("\n🛑 Press CTRL+C to stop the server\n")
    print("="*60 + "\n")
    
    # Open browser automatically
    import webbrowser
    import threading
    def open_browser():
        import time
        time.sleep(1.5)
        webbrowser.open('http://localhost:5000')
    
    threading.Thread(target=open_browser).start()
    
    app.run(debug=False, port=5000, host='127.0.0.1')

if __name__ == '__main__':
    main()
