-- Speed Boost Script
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
