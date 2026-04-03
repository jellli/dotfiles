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

	vim.keymap.set({ "n", "x" }, "<leader>p", "<cmd>YankyRingHistory<cr>", { desc = "Open Yank History" })
	vim.keymap.set({ "n", "x" }, "y", "<Plug>(YankyYank)", { desc = "Yank Text" })
	vim.keymap.set({ "n", "x" }, "p", "<Plug>(YankyPutAfter)", { desc = "Put Text After Cursor" })
	vim.keymap.set({ "n", "x" }, "P", "<Plug>(YankyPutBefore)", { desc = "Put Text Before Cursor" })
	vim.keymap.set("n", "]p", "<Plug>(YankyPutIndentAfterLinewise)", { desc = "Put Indented After Cursor (Linewise)" })
	vim.keymap.set(
		"n",
		"[p",
		"<Plug>(YankyPutIndentBeforeLinewise)",
		{ desc = "Put Indented Before Cursor (Linewise)" }
	)
	vim.keymap.set("n", "]P", "<Plug>(YankyPutIndentAfterLinewise)", { desc = "Put Indented After Cursor (Linewise)" })
	vim.keymap.set(
		"n",
		"[P",
		"<Plug>(YankyPutIndentBeforeLinewise)",
		{ desc = "Put Indented Before Cursor (Linewise)" }
	)
end

vim.schedule(load)
