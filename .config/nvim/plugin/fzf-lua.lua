local function load()
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
		fzf_opts = {
			-- ["--no-info"] = true,
		},
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

	keymap("n", "<leader><leader>", "<cmd>FzfLua files<cr>")
	keymap("n", "<leader>so", "<cmd>FzfLua oldfiles<cr>")
	keymap("n", "<leader>sh", "<cmd>FzfLua helptags<cr>")
	keymap("n", "<leader>sg", "<cmd>FzfLua live_grep_native<cr>")
	keymap("n", "<leader>sR", "<cmd>FzfLua resume<cr>")
	keymap("n", "<leader>sB", "<cmd>FzfLua buffers<cr>")
	keymap("n", "<leader>sb", "<cmd>FzfLua blines<cr>")
	keymap("n", "<leader>sk", "<cmd>FzfLua keymaps<cr>")
	keymap("i", "<c-x>p", "<cmd>FzfLua complete_path<cr>")
end

vim.schedule(load)
