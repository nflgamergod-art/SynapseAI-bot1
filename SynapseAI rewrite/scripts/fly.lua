-- Fly Script
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
