local keymap = Jili.keymap
local later = require("queue").later

later(function()
	vim.pack.add({
		"https://github.com/monkoose/neocodeium",
	})
	local neocodeium = require("neocodeium")
	neocodeium.setup({
		show_label = false,
		silent = true,
		filetypes = {
			c = false,
			markdown = false,
			zig = false,
		},
	})

	keymap("i", "<C-f>", neocodeium.accept, "Accept suggestion")
	keymap("i", "<A-w>", neocodeium.accept_word, "Accept word")
	keymap("i", "<A-l>", neocodeium.accept_line, "Accept line")
	keymap({ "n", "i" }, "<A-c>", neocodeium.clear, "Clear suggestion")
end)
