import subprocess
import platform
import psutil
import time
import os

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
    
    def execute(self, script):
        """Execute a Lua script"""
        if not self.is_injected():
            return False, "Not injected into Roblox"
        
        if not script.strip():
            return False, "Script is empty"
        
        try:
            # In a real executor, this would send the script to the injected DLL
            # For this demo, we'll simulate execution
            
            # Log the script execution
            self.log_execution(script)
            
            # Simulate script execution
            time.sleep(0.1)
            
            return True, "Script executed successfully"
        
        except Exception as e:
            return False, f"Execution error: {str(e)}"
    
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
