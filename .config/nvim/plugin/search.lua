local later = require("q").later

later(function()
	vim.pack.add({
		"https://github.com/ibhagwan/fzf-lua",
	})

	local fzf = require("fzf-lua")
	fzf.setup({
		keymap = {
			fzf = {
				["ctrl-a"] = "toggle-all",
			},
		},
		fzf_colors = {
			border = { "fg", "FloatBorder" },
			prompt = { "fg", "Comment" },
			info = { "fg", "Special" },
		},
		fzf_opts = {},
		defaults = {
			cwd_prompt = false,
			formatter = "path.filename_first",
			winopts = {
				col = 0,
				row = 1,
				border = vim.g.border,
				title_pos = "left",
				height = 0.5,
				width = 1,
			},
		},
		files = {
			winopts = { width = 0.5 },
			previewer = false,
			cwd_only = true,
		},
		oldfiles = {
			winopts = { width = 0.5 },
			previewer = false,
			cwd_only = true,
		},
		lsp = {
			includeDeclaration = false,
			---@diagnostic disable-next-line: missing-fields
			code_actions = {
				previewer = false,
				prompt = false,
				winopts = {
					relative = "cursor",
					previewer = false,
					width = 70,
					height = 15,
				},
			},
		},
		helptags = {
			actions = {
				["enter"] = fzf.actions.help_vert,
			},
		},
		ui_select = function(opts)
			opts.winopts = { width = 0.5, height = 0.5 }
			opts.winopts.title = opts.prompt
			if not opts.winopts.title then
				opts.winopts.title = opts.prompt or "Select"
			end
			opts.prompt = ""
			return opts
		end,
		complete_path = {
			file_icons = true,
			winopts = {
				title = "Insert Path",
				relative = "cursor",
				height = 0.5,
				width = 0.4,
			},
		},
	})
	local keymap = Jili.keymap

	keymap("n", "<leader><leader>", fzf.files)
	keymap("n", "<leader>so", fzf.oldfiles)
	keymap("n", "<leader>sh", fzf.help_tags)
	keymap("n", "<leader>sg", fzf.live_grep_native)
	keymap("n", "<leader>sR", fzf.resume)
	keymap("n", "<leader>sB", fzf.buffers)
	keymap("n", "<leader>sb", fzf.blines)
	keymap("n", "<leader>sk", fzf.keymaps)
	keymap("n", "<leader>ss", fzf.lsp_document_symbols)
	keymap("n", "<leader>sS", fzf.lsp_workspace_symbols)
	keymap("n", "<leader>sd", fzf.diagnostics_document)
	keymap("n", "<leader>sD", fzf.diagnostics_workspace)
	keymap("i", "<c-x>p", fzf.complete_path)
end)

later(function()
	vim.pack.add({
		"https://github.com/stevearc/quicker.nvim",
		"https://github.com/kevinhwang91/nvim-bqf",
	})
	require("quicker").setup()
	require("bqf").setup({
		preview = {
			border = "single",
			winblend = 0,
		},
	})
end)
