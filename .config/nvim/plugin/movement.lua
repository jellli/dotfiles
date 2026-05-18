local later = require("q").later

later(function()
	vim.pack.add({
		"https://codeberg.org/andyg/leap.nvim",
		"https://github.com/unblevable/quick-scope",
	})
	local keymap = Jili.keymap
	keymap({ "n", "x", "o" }, "s", "<Plug>(leap)")
	keymap({ "x", "o" }, "R", function()
		require("leap.treesitter").select({
			opts = require("leap.user").with_traversal_keys("R", "r"),
		})
	end)
end)
