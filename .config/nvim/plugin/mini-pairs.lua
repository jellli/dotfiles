local function load()
	vim.pack.add({
		"https://github.com/nvim-mini/mini.pairs",
	})

	require("mini.pairs").setup({})
end

vim.schedule(load)
