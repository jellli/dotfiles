local autocmd = Jili.autocmd
local later = require("q").later
local now = require("q").now

now(function()
	vim.api.nvim_create_autocmd("PackChanged", {
		callback = function(args)
			if args.data.spec.name == "nvim-treesitter" and args.data.kind == "update" then
				if not args.data.active then
					vim.cmd.packadd("nvim-treesitter")
				end
				vim.cmd("TSUpdate")
			end
		end,
	})

	vim.pack.add({
		{ src = "https://github.com/nvim-treesitter/nvim-treesitter", version = "main" },
	})

	local langs = {
		"bash",
		"c",
		"css",
		"go",
		"html",
		"javascript",
		"json",
		"lua",
		"toml",
		"tsx",
		"typescript",
		"vim",
		"vimdoc",
		"yaml",
		"zig",
	}
	local filetypes = {}
	for _, lang in ipairs(langs) do
		for _, ft in ipairs(vim.treesitter.language.get_filetypes(lang)) do
			table.insert(filetypes, ft)
		end
	end

	vim.api.nvim_create_user_command("InstallMissingTreesitterParser", function()
		local is_not_installed = function(lang)
			return #vim.api.nvim_get_runtime_file("parser/" .. lang .. ".*", false) == 0
		end
		local to_install = vim.tbl_filter(is_not_installed, langs)
		if #to_install > 0 then
			require("nvim-treesitter").install(to_install)
			vim.notify("Installing " .. table.concat(to_install))
			return
		end
		vim.notify("No missing parsers")
	end, {})
	autocmd("FileType", {
		pattern = filetypes,
		callback = function(ev)
			vim.wo.foldexpr = "v:lua.vim.treesitter.foldexpr()"
			vim.wo.foldmethod = "expr"
			vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
			vim.treesitter.start(ev.buf)
		end,
		desc = "Treesitter start",
	})
end)

later(function()
	vim.g.matchup_treesitter_stopline = 500

	vim.pack.add({
		"https://github.com/wansmer/treesj",
		"https://github.com/windwp/nvim-ts-autotag",
		"https://github.com/andymass/vim-matchup",
	})
	require("treesj").setup({
		use_default_keymaps = false,
		max_join_length = 200,
	})
	Jili.keymap("n", "<leader>sj", "<cmd>TSJToggle<cr>", "Toggle split/join")

	require("nvim-ts-autotag").setup({
		opts = {
			enable_close = true,
			enable_rename = true,
			enable_close_on_slash = true,
		},
	})
end)
