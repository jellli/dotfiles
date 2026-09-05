local later = require("queue").later

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
	keymap({ "n", "o" }, "gs", "<Plug>(leap-visit)")
	keymap({ "n", "o" }, "gS", "<Plug>(leap-visit-linewise)")
	-- Mnemonic: "remote (text object)".
	keymap({ "x", "o" }, "ar", "<Plug>(leap-visit-text-object)")
	keymap({ "x", "o" }, "ir", "<Plug>(leap-visit-inner-text-object)")
	keymap({ "o" }, "rr", "<Plug>(leap-visit-line)")
end)
