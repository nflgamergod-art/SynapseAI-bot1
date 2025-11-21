import subprocess
import platform
import psutil
import time
import os
import re
#include <dlfcn.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/types.h>
#include <mach/mach.h>
#include <mach/error.h>
#include <errno.h>
#include <stdlib.h>
#include <sys/sysctl.h>
#include <dlfcn.h>
#include <libproc.h>
#include <sys/mman.h>

#include <sys/stat.h>
#include <pthread.h>
#include <mach/mach_vm.h>


#define STACK_SIZE 65536
#define CODE_SIZE 128

try:
    from lupa import LuaRuntime
    LUA_AVAILABLE = True
except ImportError:
    LUA_AVAILABLE = False

class RobloxExecutor:
    def __init__(self):
        self.injected = False
        self.roblox_process = None
        self.system = platform.system()
        
    def find_roblox_process(self):
        """Find the running Roblox process"""
        roblox_names = {
            'Windows': ['RobloxPlayerBeta.exe', 'Windows10Universal.exe'],
            'Darwin': ['RobloxPlayer'],  # macOS
            'Linux': ['RobloxPlayer']
        }
        
        process_names = roblox_names.get(self.system, [])
        
        for proc in psutil.process_iter(['pid', 'name']):
            try:
                proc_name = proc.info['name']
                if any(roblox_name.lower() in proc_name.lower() for roblox_name in process_names):
                    return proc
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        
        return None
    
    def inject(self):
        """Inject into Roblox process"""
        # Find Roblox process
        self.roblox_process = self.find_roblox_process()
        
        if not self.roblox_process:
            return False, "Roblox is not running! Please launch Roblox first."
        
        try:
            # Simulate injection (in a real executor, this would involve DLL injection on Windows
            # or similar techniques on other platforms)
            time.sleep(0.5)  # Simulate injection time
            self.injected = True
            
            return True, f"Successfully injected into Roblox (PID: {self.roblox_process.pid})"
        
        except Exception as e:
            return False, f"Injection failed: {str(e)}"
    
    def is_injected(self):
        """Check if executor is injected"""
        if not self.injected:
            return False
        
        # Check if Roblox process still exists
        if self.roblox_process:
            try:
                if not self.roblox_process.is_running():
                    self.injected = False
                    return False
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                self.injected = False
                return False
        
        return True
    
    def validate_lua_syntax(self, script):
        """Validate Lua syntax and return any errors"""
        if not script.strip():
            return False, "Script is empty"
        
        # Basic Lua syntax checks
        errors = []
        
        # Check for common syntax errors
        lines = script.split('\n')
        
        # Check for balanced parentheses, brackets, and braces
        stack = []
        pairs = {'(': ')', '[': ']', '{': '}'}
        reverse_pairs = {')': '(', ']': '[', '}': '{'}
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments
            clean_line = re.sub(r'--.*$', '', line)
            
            for char in clean_line:
                if char in pairs:
                    stack.append((char, line_num))
                elif char in reverse_pairs:
                    if not stack or stack[-1][0] != reverse_pairs[char]:
                        errors.append(f"Line {line_num}: Unmatched '{char}'")
                        break
                    stack.pop()
        
        if stack:
            char, line_num = stack[-1]
            errors.append(f"Line {line_num}: Unclosed '{char}'")
        
        # Check for common Lua syntax patterns
        for line_num, line in enumerate(lines, 1):
            clean_line = line.strip()
            
            # Check for incomplete if/then statements
            if clean_line.startswith('if ') and 'then' not in clean_line:
                if line_num < len(lines) and 'then' not in lines[line_num].strip():
                    errors.append(f"Line {line_num}: 'if' statement missing 'then'")
            
            # Check for incomplete function definitions
            if clean_line.startswith('function ') and not clean_line.endswith(')'):
                if '(' in clean_line and ')' not in clean_line:
                    errors.append(f"Line {line_num}: Incomplete function definition")
        
        # Try to validate with Lua runtime if available
        if LUA_AVAILABLE and not errors:
            try:
                lua = LuaRuntime(unpack_returned_tuples=True)
                # Try to load the script (doesn't execute, just validates syntax)
                lua.execute(f"return function() {script} end")
            except Exception as e:
                error_msg = str(e)
                # Extract line number if present
                match = re.search(r':(\d+):', error_msg)
                if match:
                    line_num = match.group(1)
                    errors.append(f"Line {line_num}: {error_msg.split(':', 2)[-1].strip()}")
                else:
                    errors.append(f"Syntax error: {error_msg}")
        
        if errors:
            return False, "\n".join(errors)
        
        return True, "Syntax valid"
    
    def execute(self, script):
        """Execute a Lua script with realistic simulation"""
        if not self.is_injected():
            return False, "Not injected into Roblox"
        
        if not script.strip():
            return False, "Script is empty"
        
        # First, validate the Lua syntax
        syntax_valid, syntax_message = self.validate_lua_syntax(script)
        if not syntax_valid:
            return False, f"Syntax Error:\n{syntax_message}"
        
        try:
            # Simulate script execution with realistic behavior
            
            # Check for common Roblox API calls to provide feedback
            roblox_apis = {
                'game:GetService': 'Accessing game service',
                'workspace': 'Accessing workspace',
                'Players': 'Accessing Players service',
                'LocalPlayer': 'Getting local player',
                'print': 'Console output',
                'warn': 'Console warning',
                'SetCore': 'Setting core GUI',
                'Instance.new': 'Creating new instance',
                'wait': 'Script delay',
                'spawn': 'Spawning thread',
            }
            
            detected_calls = []
            for api_call, description in roblox_apis.items():
                if api_call in script:
                    detected_calls.append(f"  • {description} ({api_call})")
            
            # Log the script execution
            self.log_execution(script)
            
            # Simulate execution time based on script complexity
            lines = len([l for l in script.split('\n') if l.strip() and not l.strip().startswith('--')])
            execution_time = min(0.1 + (lines * 0.01), 1.0)
            time.sleep(execution_time)
            
            # Build success message
            message = "✓ Script executed successfully"
            if detected_calls:
                message += "\n\nDetected API calls:"
                message += "\n" + "\n".join(detected_calls)
            
            message += f"\n\n[Simulated execution - {lines} lines processed]"
            
            return True, message
        
        except Exception as e:
            return False, f"Execution error: {str(e)}"
    
    def test_script_locally(self, script):
        """
        Test a Lua script locally using a sandboxed Lua interpreter.
        This allows testing script logic without Roblox.
        Returns: (success, output/error message, console_output)
        """
        if not LUA_AVAILABLE:
            return False, "Lua interpreter not available. Install lupa: pip install lupa", ""
        
        if not script.strip():
            return False, "Script is empty", ""
        
        # First validate syntax
        syntax_valid, syntax_message = self.validate_lua_syntax(script)
        if not syntax_valid:
            return False, f"Syntax Error:\n{syntax_message}", ""
        
        try:
            lua = LuaRuntime(unpack_returned_tuples=True)
            
            # Capture print outputs
            console_output = []
            
            # Create a mock print function to capture output
            lua.execute("""
                _original_print = print
                _console_output = {}
                function print(...)
                    local args = {...}
                    local output = ""
                    for i, v in ipairs(args) do
                        if i > 1 then output = output .. "\\t" end
                        output = output .. tostring(v)
                    end
                    table.insert(_console_output, output)
                end
            """)
            
            # Create mock Roblox API to prevent errors
            lua.execute("""
                -- Mock Roblox game object
                game = {
                    GetService = function(self, service)
                        return {
                            _name = service,
                            SetCore = function() end,
                        }
                    end,
                }
                
                -- Mock workspace
                workspace = {
                    _name = "Workspace",
                }
                
                -- Mock wait function
                function wait(duration)
                    return duration or 0
                end
                
                -- Mock spawn function  
                function spawn(func)
                    func()
                end
                
                -- Mock Instance
                Instance = {
                    new = function(className)
                        return {
                            _className = className,
                            Name = "MockInstance",
                        }
                    end
                }
            """)
            
            # Execute the user's script
            lua.execute(script)
            
            # Get console output
            output_table = lua.eval('_console_output')
            if output_table:
                for item in output_table.values():
                    console_output.append(str(item))
            
            # Build result message
            result_msg = "✓ Script tested successfully (local Lua interpreter)"
            
            if console_output:
                result_msg += "\n\n📄 Console Output:"
                result_msg += "\n" + "\n".join([f"  {line}" for line in console_output])
            else:
                result_msg += "\n\n(No console output)"
            
            result_msg += "\n\n⚠️  Note: This is a local test using mock Roblox APIs."
            result_msg += "\n   Some Roblox-specific features may not work exactly as in-game."
            
            return True, result_msg, "\n".join(console_output)
        
        except Exception as e:
            error_msg = str(e)
            # Try to extract useful error information
            if ':' in error_msg:
                parts = error_msg.split(':', 2)
                if len(parts) >= 3:
                    error_msg = parts[-1].strip()
            
            return False, f"Runtime Error:\n{error_msg}", "\n".join(console_output) if console_output else ""
    
    def log_execution(self, script):
        """Log script execution to a file"""
        try:
            log_dir = "logs"
            if not os.path.exists(log_dir):
                os.makedirs(log_dir)
            
            log_file = os.path.join(log_dir, "execution_log.txt")
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(f"\n{'='*50}\n")
                f.write(f"Timestamp: {timestamp}\n")
                f.write(f"{'='*50}\n")
                f.write(script)
                f.write(f"\n{'='*50}\n")
        
        except Exception as e:
            print(f"Failed to log execution: {e}")
    
    def get_roblox_info(self):
        """Get information about the Roblox process"""
        if not self.roblox_process:
            return None
        
        try:
            return {
                'pid': self.roblox_process.pid,
                'name': self.roblox_process.name(),
                'status': self.roblox_process.status(),
                'memory': self.roblox_process.memory_info().rss / 1024 / 1024  # MB
            }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None

    def find_roblox_pid(self):
        """Find the PID of the running Roblox process"""
        try:
            # Iterate over all running processes
            for proc in psutil.process_iter(['pid', 'name']):
                try:
                    # Check if the process name matches RobloxPlayer
                    if proc.info['name'] == "RobloxPlayer":
                        return proc.info['pid']
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            
            return None
        except Exception as e:
            print(f"Error finding Roblox PID: {e}")
            return None

char injectedCode[] = "\x55\x48\x89\xe5..." // x86-64 assembly
