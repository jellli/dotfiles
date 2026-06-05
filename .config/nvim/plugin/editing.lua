local later = require("q").later

later(function()
	vim.pack.add({
		"https://github.com/nvim-mini/mini.ai",
		"https://github.com/nvim-mini/mini.pairs",
		"https://github.com/nvim-mini/mini.input",
		"https://github.com/kylechui/nvim-surround",
		"https://github.com/gbprod/yanky.nvim",
	})

	local miniai = require("mini.ai")
	miniai.setup({
		custom_textobjects = {
			f = miniai.gen_spec.treesitter({ a = "@function.outer", i = "@function.inner" }, {}),
			g = function()
				local from = { line = 1, col = 1 }
				local to = {
					line = vim.fn.line("$"),
					col = math.max(vim.fn.getline("$"):len(), 1),
				}
				return { from = from, to = to }
			end,
		},
		silent = true,
	})
	require("mini.input").setup({})
	require("mini.pairs").setup({})
	require("nvim-surround").setup({})
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

	keymap("x", "(", "S)", { remap = true, desc = "Surround with ()'s" })
	keymap("x", ")", "S)", { remap = true, desc = "Surround with ()'s" })
	keymap("x", "{", "S}", { remap = true, desc = "Surround with {}'s" })
	keymap("x", "}", "S}", { remap = true, desc = "Surround with {}'s" })
	keymap("x", "[", "S]", { remap = true, desc = "Surround with []'s" })
	keymap("x", "]", "S]", { remap = true, desc = "Surround with []'s" })
end)

