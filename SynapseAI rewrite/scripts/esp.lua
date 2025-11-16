-- Player ESP Script
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
