local function load()
	vim.pack.add({
		"https://github.com/windwp/nvim-ts-autotag",
	})

	require("nvim-ts-autotag").setup({
		opts = {
			enable_close = true,
			enable_rename = true,
			enable_close_on_slash = true,
		},
	})
end

Jili.autocmd(
	"FileType",
	{ pattern = {
		"typescript",
		"typescriptreact",
		"javascript",
		"javascriptreact",
	}, callback = load }
)
