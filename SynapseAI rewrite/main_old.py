import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import os
import json
from executor import RobloxExecutor
from script_hub import ScriptHub

class RobloxExecutorGUI:
    def __init__(self):
        # Initialize main window
        self.root = tk.Tk()
        self.root.title("SynapseAI Executor")
        self.root.geometry("900x600")
        
        # Set dark theme colors
        self.bg_color = "#1a1a1a"
        self.fg_color = "#ffffff"
        self.button_color = "#2d2d2d"
        self.entry_bg = "#2d2d2d"
        self.root.configure(bg=self.bg_color)
        
        # Initialize backend
        self.executor = RobloxExecutor()
        self.script_hub = ScriptHub()
        
        # Setup GUI
        self.setup_gui()
        
    def setup_gui(self):
        # Main container
        self.main_frame = ctk.CTkFrame(self.root)
        self.main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Title
        title_label = ctk.CTkLabel(
            self.main_frame,
            text="SynapseAI Executor",
            font=ctk.CTkFont(size=24, weight="bold")
        )
        title_label.pack(pady=10)
        
        # Status bar
        self.status_frame = ctk.CTkFrame(self.main_frame)
        self.status_frame.pack(fill="x", padx=10, pady=5)
        
        self.status_label = ctk.CTkLabel(
            self.status_frame,
            text="Status: Not Injected",
            font=ctk.CTkFont(size=12)
        )
        self.status_label.pack(side="left", padx=10, pady=5)
        
        self.inject_button = ctk.CTkButton(
            self.status_frame,
            text="Inject",
            command=self.inject,
            width=100
        )
        self.inject_button.pack(side="right", padx=10, pady=5)
        
        # Script editor frame
        editor_frame = ctk.CTkFrame(self.main_frame)
        editor_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Script editor label
        editor_label = ctk.CTkLabel(
            editor_frame,
            text="Script Editor",
            font=ctk.CTkFont(size=14, weight="bold")
        )
        editor_label.pack(anchor="w", padx=10, pady=5)
        
        # Script text box
        self.script_textbox = ctk.CTkTextbox(
            editor_frame,
            font=ctk.CTkFont(family="Courier New", size=12),
            wrap="none"
        )
        self.script_textbox.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Insert default script
        default_script = """-- SynapseAI Executor
-- Welcome to SynapseAI!

print("Hello from SynapseAI!")
game:GetService("StarterGui"):SetCore("SendNotification", {
    Title = "SynapseAI";
    Text = "Script executed successfully!";
    Duration = 5;
})
"""
        self.script_textbox.insert("1.0", default_script)
        
        # Button frame
        button_frame = ctk.CTkFrame(self.main_frame)
        button_frame.pack(fill="x", padx=10, pady=5)
        
        # Execute button
        self.execute_button = ctk.CTkButton(
            button_frame,
            text="Execute",
            command=self.execute_script,
            width=120,
            height=35,
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#2ecc71",
            hover_color="#27ae60"
        )
        self.execute_button.pack(side="left", padx=5)
        
        # Clear button
        clear_button = ctk.CTkButton(
            button_frame,
            text="Clear",
            command=self.clear_script,
            width=120,
            height=35,
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#e74c3c",
            hover_color="#c0392b"
        )
        clear_button.pack(side="left", padx=5)
        
        # Open file button
        open_button = ctk.CTkButton(
            button_frame,
            text="Open Script",
            command=self.open_script,
            width=120,
            height=35,
            font=ctk.CTkFont(size=14, weight="bold")
        )
        open_button.pack(side="left", padx=5)
        
        # Save file button
        save_button = ctk.CTkButton(
            button_frame,
            text="Save Script",
            command=self.save_script,
            width=120,
            height=35,
            font=ctk.CTkFont(size=14, weight="bold")
        )
        save_button.pack(side="left", padx=5)
        
        # Script Hub button
        hub_button = ctk.CTkButton(
            button_frame,
            text="Script Hub",
            command=self.open_script_hub,
            width=120,
            height=35,
            font=ctk.CTkFont(size=14, weight="bold"),
            fg_color="#9b59b6",
            hover_color="#8e44ad"
        )
        hub_button.pack(side="left", padx=5)
        
    def inject(self):
        """Inject into Roblox process"""
        success, message = self.executor.inject()
        if success:
            self.status_label.configure(text="Status: Injected ✓")
            self.inject_button.configure(state="disabled")
            messagebox.showinfo("Success", message)
        else:
            messagebox.showerror("Error", message)
    
    def execute_script(self):
        """Execute the script in the textbox"""
        if not self.executor.is_injected():
            messagebox.showwarning("Warning", "Please inject first!")
            return
        
        script = self.script_textbox.get("1.0", "end-1c")
        if not script.strip():
            messagebox.showwarning("Warning", "Script is empty!")
            return
        
        success, message = self.executor.execute(script)
        if success:
            messagebox.showinfo("Success", "Script executed successfully!")
        else:
            messagebox.showerror("Error", f"Execution failed: {message}")
    
    def clear_script(self):
        """Clear the script textbox"""
        self.script_textbox.delete("1.0", "end")
    
    def open_script(self):
        """Open a script file"""
        filename = filedialog.askopenfilename(
            title="Open Script",
            filetypes=[("Lua files", "*.lua"), ("Text files", "*.txt"), ("All files", "*.*")]
        )
        if filename:
            try:
                with open(filename, 'r', encoding='utf-8') as file:
                    script = file.read()
                    self.script_textbox.delete("1.0", "end")
                    self.script_textbox.insert("1.0", script)
            except Exception as e:
                messagebox.showerror("Error", f"Failed to open file: {str(e)}")
    
    def save_script(self):
        """Save the current script to a file"""
        filename = filedialog.asksaveasfilename(
            title="Save Script",
            defaultextension=".lua",
            filetypes=[("Lua files", "*.lua"), ("Text files", "*.txt"), ("All files", "*.*")]
        )
        if filename:
            try:
                script = self.script_textbox.get("1.0", "end-1c")
                with open(filename, 'w', encoding='utf-8') as file:
                    file.write(script)
                messagebox.showinfo("Success", "Script saved successfully!")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save file: {str(e)}")
    
    def open_script_hub(self):
        """Open the script hub window"""
        hub_window = ScriptHubWindow(self.root, self.script_hub, self.load_script_from_hub)
    
    def load_script_from_hub(self, script_content):
        """Load a script from the script hub into the editor"""
        self.script_textbox.delete("1.0", "end")
        self.script_textbox.insert("1.0", script_content)
    
    def run(self):
        """Start the application"""
        self.root.mainloop()


class ScriptHubWindow:
    def __init__(self, parent, script_hub, callback):
        self.script_hub = script_hub
        self.callback = callback
        
        # Create window
        self.window = ctk.CTkToplevel(parent)
        self.window.title("Script Hub")
        self.window.geometry("700x500")
        
        # Title
        title_label = ctk.CTkLabel(
            self.window,
            text="Script Hub",
            font=ctk.CTkFont(size=20, weight="bold")
        )
        title_label.pack(pady=10)
        
        # Scripts frame
        scripts_frame = ctk.CTkFrame(self.window)
        scripts_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        # Scrollable frame for scripts
        self.scrollable_frame = ctk.CTkScrollableFrame(scripts_frame)
        self.scrollable_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Load and display scripts
        self.load_scripts()
    
    def load_scripts(self):
        """Load all scripts from the hub"""
        scripts = self.script_hub.get_all_scripts()
        
        if not scripts:
            no_scripts_label = ctk.CTkLabel(
                self.scrollable_frame,
                text="No scripts available. Add some scripts to the 'scripts' folder!",
                font=ctk.CTkFont(size=12)
            )
            no_scripts_label.pack(pady=20)
            return
        
        for script_name, script_data in scripts.items():
            self.create_script_card(script_name, script_data)
    
    def create_script_card(self, name, data):
        """Create a card for a script"""
        card = ctk.CTkFrame(self.scrollable_frame)
        card.pack(fill="x", padx=5, pady=5)
        
        # Script name
        name_label = ctk.CTkLabel(
            card,
            text=name,
            font=ctk.CTkFont(size=14, weight="bold")
        )
        name_label.pack(anchor="w", padx=10, pady=5)
        
        # Script description
        desc_label = ctk.CTkLabel(
            card,
            text=data.get('description', 'No description'),
            font=ctk.CTkFont(size=11),
            text_color="gray"
        )
        desc_label.pack(anchor="w", padx=10, pady=2)
        
        # Load button
        load_button = ctk.CTkButton(
            card,
            text="Load Script",
            command=lambda: self.load_script(data['content']),
            width=100
        )
        load_button.pack(anchor="e", padx=10, pady=5)
    
    def load_script(self, content):
        """Load the selected script"""
        self.callback(content)
        self.window.destroy()


if __name__ == "__main__":
    app = RobloxExecutorGUI()
    app.run()
