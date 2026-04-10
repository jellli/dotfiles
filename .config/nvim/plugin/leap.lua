vim.pack.add({
	"https://codeberg.org/andyg/leap.nvim",
})

vim.keymap.set({ "n", "x", "o" }, "s", "<Plug>(leap)")
vim.keymap.set("n", "S", "<Plug>(leap-anywhere)")
vim.keymap.set({ "x", "o" }, "R", function()
	require("leap.treesitter").select({
		opts = require("leap.user").with_traversal_keys("R", "r"),
	})
end)
