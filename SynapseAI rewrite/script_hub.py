import os
import json

class ScriptHub:
    def __init__(self):
        self.scripts_dir = "scripts"
        self.ensure_scripts_directory()
        self.load_default_scripts()
    
    def ensure_scripts_directory(self):
        """Ensure the scripts directory exists"""
        if not os.path.exists(self.scripts_dir):
            os.makedirs(self.scripts_dir)
    
    def load_default_scripts(self):
        """Load default scripts if scripts directory is empty"""
        if not os.listdir(self.scripts_dir):
            self.create_default_scripts()
    
    def create_default_scripts(self):
        """Create some default example scripts"""
        default_scripts = {
            "infinite_jump.lua": {
                "name": "Infinite Jump",
                "description": "Jump infinitely high in any game",
                "content": """-- Infinite Jump Script
local Player = game:GetService("Players").LocalPlayer
local UIS = game:GetService("UserInputService")

local function onJumpRequest()
    local character = Player.Character
    if character then
        local humanoid = character:FindFirstChildOfClass("Humanoid")
        if humanoid then
            humanoid:ChangeState(Enum.HumanoidStateType.Jumping)
        end
    end
end

UIS.JumpRequest:Connect(onJumpRequest)

game:GetService("StarterGui"):SetCore("SendNotification", {
    Title = "Infinite Jump";
    Text = "Activated! Press space to jump infinitely!";
    Duration = 5;
})
"""
            },
            "speed_boost.lua": {
                "name": "Speed Boost",
                "description": "Increase your walk speed",
                "content": """-- Speed Boost Script
local Player = game:GetService("Players").LocalPlayer
local speedMultiplier = 2 -- Change this value to adjust speed

local function setSpeed()
    local character = Player.Character
    if character then
        local humanoid = character:FindFirstChildOfClass("Humanoid")
        if humanoid then
            humanoid.WalkSpeed = 16 * speedMultiplier
            print("Speed set to: " .. humanoid.WalkSpeed)
        end
    end
end

Player.CharacterAdded:Connect(setSpeed)
if Player.Character then
    setSpeed()
end

game:GetService("StarterGui"):SetCore("SendNotification", {
    Title = "Speed Boost";
    Text = "Speed increased to " .. (16 * speedMultiplier) .. "!";
    Duration = 5;
})
"""
            },
            "fly.lua": {
                "name": "Fly Script",
                "description": "Fly around the map (Press E to toggle)",
                "content": """-- Fly Script
local Player = game:GetService("Players").LocalPlayer
local UIS = game:GetService("UserInputService")
local flying = false
local speed = 50

local bodyVelocity = nil
local bodyGyro = nil

local function startFly()
    local character = Player.Character
    if not character then return end
    
    local torso = character:FindFirstChild("HumanoidRootPart") or character:FindFirstChild("Torso")
    if not torso then return end
    
    bodyVelocity = Instance.new("BodyVelocity", torso)
    bodyVelocity.MaxForce = Vector3.new(9e9, 9e9, 9e9)
    bodyVelocity.Velocity = Vector3.new(0, 0, 0)
    
    bodyGyro = Instance.new("BodyGyro", torso)
    bodyGyro.MaxTorque = Vector3.new(9e9, 9e9, 9e9)
    bodyGyro.CFrame = torso.CFrame
    
    flying = true
    
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Fly";
        Text = "Flying enabled! Use WASD to move.";
        Duration = 3;
    })
end

local function stopFly()
    if bodyVelocity then bodyVelocity:Destroy() end
    if bodyGyro then bodyGyro:Destroy() end
    flying = false
    
    game:GetService("StarterGui"):SetCore("SendNotification", {
        Title = "Fly";
        Text = "Flying disabled!";
        Duration = 3;
    })
end

UIS.InputBegan:Connect(function(input, gameProcessed)
    if gameProcessed then return end
    
    if input.KeyCode == Enum.KeyCode.E then
        if flying then
            stopFly()
        else
            startFly()
        end
    end
end)

game:GetService("RunService").Heartbeat:Connect(function()
    if flying and bodyVelocity and bodyGyro then
        local character = Player.Character
        if not character then return end
        
        local camera = workspace.CurrentCamera
        local direction = Vector3.new(0, 0, 0)
        
        if UIS:IsKeyDown(Enum.KeyCode.W) then
            direction = direction + (camera.CFrame.LookVector * speed)
        end
        if UIS:IsKeyDown(Enum.KeyCode.S) then
            direction = direction - (camera.CFrame.LookVector * speed)
        end
        if UIS:IsKeyDown(Enum.KeyCode.A) then
            direction = direction - (camera.CFrame.RightVector * speed)
        end
        if UIS:IsKeyDown(Enum.KeyCode.D) then
            direction = direction + (camera.CFrame.RightVector * speed)
        end
        
        bodyVelocity.Velocity = direction
        bodyGyro.CFrame = camera.CFrame
    end
end)

print("Fly script loaded! Press E to toggle flying.")
"""
            },
            "esp.lua": {
                "name": "Player ESP",
                "description": "See players through walls",
                "content": """-- Player ESP Script
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

local function createESP(player)
    if player == LocalPlayer then return end
    
    local function addHighlight(character)
        if character:FindFirstChild("ESPHighlight") then return end
        
        local highlight = Instance.new("Highlight")
        highlight.Name = "ESPHighlight"
        highlight.FillColor = Color3.fromRGB(255, 0, 0)
        highlight.OutlineColor = Color3.fromRGB(255, 255, 255)
        highlight.FillTransparency = 0.5
        highlight.OutlineTransparency = 0
        highlight.Parent = character
    end
    
    if player.Character then
        addHighlight(player.Character)
    end
    
    player.CharacterAdded:Connect(addHighlight)
end

for _, player in pairs(Players:GetPlayers()) do
    createESP(player)
end

Players.PlayerAdded:Connect(createESP)

game:GetService("StarterGui"):SetCore("SendNotification", {
    Title = "ESP";
    Text = "Player ESP enabled!";
    Duration = 5;
})
"""
            }
        }
        
        # Create script files
        for filename, script_data in default_scripts.items():
            filepath = os.path.join(self.scripts_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(script_data['content'])
            
            # Create metadata file
            meta_filepath = filepath.replace('.lua', '.json')
            meta_data = {
                'name': script_data['name'],
                'description': script_data['description']
            }
            with open(meta_filepath, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, indent=4)
    
    def get_all_scripts(self):
        """Get all scripts from the scripts directory"""
        scripts = {}
        
        for filename in os.listdir(self.scripts_dir):
            if filename.endswith('.lua'):
                script_path = os.path.join(self.scripts_dir, filename)
                meta_path = script_path.replace('.lua', '.json')
                
                # Load script content
                with open(script_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Load metadata if exists
                metadata = {}
                if os.path.exists(meta_path):
                    try:
                        with open(meta_path, 'r', encoding='utf-8') as f:
                            metadata = json.load(f)
                    except:
                        pass
                
                script_name = metadata.get('name', filename.replace('.lua', ''))
                scripts[script_name] = {
                    'filename': filename,
                    'description': metadata.get('description', 'No description available'),
                    'content': content
                }
        
        return scripts
    
    def add_script(self, name, content, description=""):
        """Add a new script to the hub"""
        filename = name.lower().replace(' ', '_') + '.lua'
        filepath = os.path.join(self.scripts_dir, filename)
        
        # Save script
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        # Save metadata
        meta_filepath = filepath.replace('.lua', '.json')
        metadata = {
            'name': name,
            'description': description
        }
        with open(meta_filepath, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=4)
        
        return True
    
    def delete_script(self, filename):
        """Delete a script from the hub"""
        script_path = os.path.join(self.scripts_dir, filename)
        meta_path = script_path.replace('.lua', '.json')
        
        try:
            if os.path.exists(script_path):
                os.remove(script_path)
            if os.path.exists(meta_path):
                os.remove(meta_path)
            return True
        except Exception as e:
            print(f"Error deleting script: {e}")
            return False
