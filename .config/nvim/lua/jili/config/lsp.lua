vim.lsp.config("vtsls", {
	typescript = {
		locale = "zh-CN",
	},
})

vim.lsp.config("zls", {
	enable_build_on_save = true,
	-- build_on_save_args = { "install", "-Dtarget=wasm32-wasi", "-fwasmtime" },
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
