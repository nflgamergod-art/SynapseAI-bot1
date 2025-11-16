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
        self.root.geometry("900x650")
        
        # Colors
        self.bg_color = "#1e1e1e"
        self.fg_color = "#ffffff"
        self.button_bg = "#3a3a3a"
        self.button_fg = "#ffffff"
        self.text_bg = "#2d2d2d"
        self.text_fg = "#ffffff"
        
        self.root.configure(bg=self.bg_color)
        
        # Initialize backend
        self.executor = RobloxExecutor()
        self.script_hub = ScriptHub()
        
        # Setup GUI
        self.setup_gui()
        
    def setup_gui(self):
        # Title
        title_frame = tk.Frame(self.root, bg=self.bg_color)
        title_frame.pack(pady=15)
        
        title_label = tk.Label(
            title_frame,
            text="SynapseAI Executor",
            font=("Arial", 28, "bold"),
            bg=self.bg_color,
            fg="#3498db"
        )
        title_label.pack()
        
        # Status bar
        status_frame = tk.Frame(self.root, bg=self.button_bg)
        status_frame.pack(fill="x", padx=20, pady=5)
        
        self.status_label = tk.Label(
            status_frame,
            text="Status: Not Injected",
            font=("Arial", 11),
            bg=self.button_bg,
            fg=self.fg_color
        )
        self.status_label.pack(side="left", padx=10, pady=8)
        
        self.inject_button = tk.Button(
            status_frame,
            text="Inject",
            command=self.inject,
            bg="#2ecc71",
            fg="white",
            font=("Arial", 10, "bold"),
            relief="flat",
            padx=20,
            pady=5,
            cursor="hand2"
        )
        self.inject_button.pack(side="right", padx=10, pady=5)
        
        # Script editor frame
        editor_frame = tk.Frame(self.root, bg=self.bg_color)
        editor_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        # Editor label
        editor_label = tk.Label(
            editor_frame,
            text="Script Editor",
            font=("Arial", 13, "bold"),
            bg=self.bg_color,
            fg=self.fg_color
        )
        editor_label.pack(anchor="w", pady=(0, 5))
        
        # Script text box
        self.script_textbox = scrolledtext.ScrolledText(
            editor_frame,
            font=("Courier New", 11),
            bg=self.text_bg,
            fg=self.text_fg,
            insertbackground=self.fg_color,
            relief="flat",
            wrap="none"
        )
        self.script_textbox.pack(fill="both", expand=True)
        
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
        button_frame = tk.Frame(self.root, bg=self.bg_color)
        button_frame.pack(fill="x", padx=20, pady=15)
        
        # Button style
        button_config = {
            "font": ("Arial", 11, "bold"),
            "relief": "flat",
            "cursor": "hand2",
            "padx": 15,
            "pady": 8
        }
        
        # Execute button
        self.execute_button = tk.Button(
            button_frame,
            text="Execute",
            command=self.execute_script,
            bg="#2ecc71",
            fg="white",
            **button_config
        )
        self.execute_button.pack(side="left", padx=5)
        
        # Clear button
        clear_button = tk.Button(
            button_frame,
            text="Clear",
            command=self.clear_script,
            bg="#e74c3c",
            fg="white",
            **button_config
        )
        clear_button.pack(side="left", padx=5)
        
        # Open file button
        open_button = tk.Button(
            button_frame,
            text="Open Script",
            command=self.open_script,
            bg=self.button_bg,
            fg="white",
            **button_config
        )
        open_button.pack(side="left", padx=5)
        
        # Save file button
        save_button = tk.Button(
            button_frame,
            text="Save Script",
            command=self.save_script,
            bg=self.button_bg,
            fg="white",
            **button_config
        )
        save_button.pack(side="left", padx=5)
        
        # Script Hub button
        hub_button = tk.Button(
            button_frame,
            text="Script Hub",
            command=self.open_script_hub,
            bg="#9b59b6",
            fg="white",
            **button_config
        )
        hub_button.pack(side="left", padx=5)
        
    def inject(self):
        """Inject into Roblox process"""
        success, message = self.executor.inject()
        if success:
            self.status_label.configure(text="Status: Injected ✓", fg="#2ecc71")
            self.inject_button.configure(state="disabled", bg="#27ae60")
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
        
        # Colors
        self.bg_color = "#1e1e1e"
        self.fg_color = "#ffffff"
        self.card_bg = "#2d2d2d"
        
        # Create window
        self.window = tk.Toplevel(parent)
        self.window.title("Script Hub")
        self.window.geometry("700x550")
        self.window.configure(bg=self.bg_color)
        
        # Title
        title_label = tk.Label(
            self.window,
            text="Script Hub",
            font=("Arial", 22, "bold"),
            bg=self.bg_color,
            fg="#9b59b6"
        )
        title_label.pack(pady=15)
        
        # Create canvas and scrollbar for scrolling
        canvas_frame = tk.Frame(self.window, bg=self.bg_color)
        canvas_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        canvas = tk.Canvas(canvas_frame, bg=self.bg_color, highlightthickness=0)
        scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=canvas.yview)
        self.scrollable_frame = tk.Frame(canvas, bg=self.bg_color)
        
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # Load and display scripts
        self.load_scripts()
    
    def load_scripts(self):
        """Load all scripts from the hub"""
        scripts = self.script_hub.get_all_scripts()
        
        if not scripts:
            no_scripts_label = tk.Label(
                self.scrollable_frame,
                text="No scripts available. Add some scripts to the 'scripts' folder!",
                font=("Arial", 11),
                bg=self.bg_color,
                fg=self.fg_color
            )
            no_scripts_label.pack(pady=20)
            return
        
        for script_name, script_data in scripts.items():
            self.create_script_card(script_name, script_data)
    
    def create_script_card(self, name, data):
        """Create a card for a script"""
        card = tk.Frame(self.scrollable_frame, bg=self.card_bg, relief="raised", bd=1)
        card.pack(fill="x", padx=10, pady=8, ipady=5)
        
        # Script name
        name_label = tk.Label(
            card,
            text=name,
            font=("Arial", 13, "bold"),
            bg=self.card_bg,
            fg="#3498db",
            anchor="w"
        )
        name_label.pack(anchor="w", padx=15, pady=(8, 2))
        
        # Script description
        desc_label = tk.Label(
            card,
            text=data.get('description', 'No description'),
            font=("Arial", 10),
            bg=self.card_bg,
            fg="#95a5a6",
            anchor="w",
            wraplength=550,
            justify="left"
        )
        desc_label.pack(anchor="w", padx=15, pady=(2, 8))
        
        # Load button
        load_button = tk.Button(
            card,
            text="Load Script",
            command=lambda: self.load_script(data['content']),
            bg="#9b59b6",
            fg="white",
            font=("Arial", 10, "bold"),
            relief="flat",
            cursor="hand2",
            padx=15,
            pady=5
        )
        load_button.pack(anchor="e", padx=15, pady=(0, 8))
    
    def load_script(self, content):
        """Load the selected script"""
        self.callback(content)
        self.window.destroy()


if __name__ == "__main__":
    app = RobloxExecutorGUI()
    app.run()
