---@type vim.lsp.Config
return {
	cmd = { "emmet-ls", "--stdio" },
	filetypes = {
		"astro",
		"css",
		"eruby",
		"html",
		"htmldjango",
		"javascriptreact",
		"less",
		"pug",
		"sass",
		"scss",
		"svelte",
		"typescriptreact",
		"vue",
		"htmlangular",
	},
	settings = {
		init_options = {
			jsx = {
				options = {
					["jsx.enabled"] = true,
					["markup.attributes"] = {
						["class"] = "className",
						["class*"] = "className",
						["for"] = "htmlFor",
					},
					["markup.valuePrefix"] = {
						["class*"] = "styles",
					},
				},
			},
		},
	},
}
