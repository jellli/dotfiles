vim.lsp.config( ---@type vim.lsp.Config
	"zls",
	{
		cmd = { "zls" },
		filetypes = { "zig", "zir" },
		root_markers = { "zls.json", "build.zig", ".git" },
	}
)

vim.lsp.config("vtsls", {
	typescript = {
		locale = "zh-CN",
	},
})

vim.lsp.config("emmet_ls", {
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
})

vim.lsp.enable({
	"lua_ls",
	"vtsls",
	"cssls",
	"cssmodules_ls",
	"emmet_ls",
	"marksman",
	"zls",
})
