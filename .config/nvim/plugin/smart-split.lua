local loaded = false
local function load()
	if loaded then
		return
	end
	vim.pack.add({
		"https://github.com/mrjones2014/smart-splits.nvim",
	})
	require("smart-splits").setup({})
	loaded = true
end

local keymap = Jili.keymap

keymap("n", "<A-h>", function()
	load()
	require("smart-splits").resize_left()
end)
keymap("n", "<A-j>", function()
	load()
	require("smart-splits").resize_down()
end)
keymap("n", "<A-k>", function()
	load()
	require("smart-splits").resize_down()
end)
keymap("n", "<A-l>", function()
	load()
	require("smart-splits").resize_right()
end)

keymap("n", "<C-h>", function()
	load()
	require("smart-splits").move_cursor_left()
end)
keymap("n", "<C-j>", function()
	load()
	require("smart-splits").move_cursor_down()
end)
keymap("n", "<C-k>", function()
	load()
	require("smart-splits").move_cursor_up()
end)
keymap("n", "<C-l>", function()
	load()
	require("smart-splits").move_cursor_right()
end)
keymap("n", "<C-\\>", function()
	load()
	require("smart-splits").move_cursor_previous()
end)
