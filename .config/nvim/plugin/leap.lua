vim.pack.add({
	"https://codeberg.org/andyg/leap.nvim",
})

local keymap = Jili.keymap
keymap({ "n", "x", "o" }, "s", "<Plug>(leap)")
keymap("n", "S", "<Plug>(leap-anywhere)")
keymap({ "x", "o" }, "R", function()
	require("leap.treesitter").select({
		opts = require("leap.user").with_traversal_keys("R", "r"),
	})
end)
