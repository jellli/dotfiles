local function load()
	vim.pack.add({
		"https://github.com/kylechui/nvim-surround",
	})

	require("nvim-surround").setup({})
end

vim.schedule(load)
