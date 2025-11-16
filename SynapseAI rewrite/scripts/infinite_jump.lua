-- Infinite Jump Script
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
