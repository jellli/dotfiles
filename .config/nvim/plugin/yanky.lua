local function load()
	vim.pack.add({
		"https://github.com/gbprod/yanky.nvim",
	})

	require("yanky").setup({
		system_clipboard = {
			sync_with_ring = true,
		},
		highlight = { timer = 150 },
	})

	local keymap = Jili.keymap

	keymap({ "n", "x" }, "<leader>p", "<cmd>YankyRingHistory<cr>", "Open Yank History")
	keymap({ "n", "x" }, "y", "<Plug>(YankyYank)", "Yank Text")
	keymap({ "n", "x" }, "p", "<Plug>(YankyPutAfter)", "Put Text After Cursor")
	keymap({ "n", "x" }, "P", "<Plug>(YankyPutBefore)", "Put Text Before Cursor")
	keymap("n", "]p", "<Plug>(YankyPutIndentAfterLinewise)", "Put Indented After Cursor (Linewise)")
	keymap("n", "[p", "<Plug>(YankyPutIndentBeforeLinewise)", "Put Indented Before Cursor (Linewise)")
	keymap("n", "]P", "<Plug>(YankyPutIndentAfterLinewise)", "Put Indented After Cursor (Linewise)")
	keymap("n", "[P", "<Plug>(YankyPutIndentBeforeLinewise)", "Put Indented Before Cursor (Linewise)")
end

vim.schedule(load)
