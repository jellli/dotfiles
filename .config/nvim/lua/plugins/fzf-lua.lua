require("utils")

return {
	"ibhagwan/fzf-lua",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		local fzf = require("fzf-lua")
		fzf.register_ui_select()

		fzf.setup({
			"hide",
			winopts = {
				border = "single",
				height = 15,
				width = 76,
				row = 0.2,
				col = 0.5,
				preview = {
					hidden = true,
				},
			},
			hls = {
				title = "Constant",
				border = "FloatBorder",
				preview_border = "FloatBorder",
			},
			fzf_colors = {
				["bg"] = { "bg", "FloatBorder" },
				["bg+"] = { "bg", "FloatBorder" },

				["fg"] = { "fg", "Comment" },
				["fg+"] = { "fg", "PreProc" },

				["hl"] = { "fg", "Error" },
				["hl+"] = { "fg", "Error" },
			},
			actions = {
				["ctrl-h"] = fzf.actions.file_split,
			},
		})

		local builtin_opts = {
			winopts = {
				border = "single",
				preview = {
					border = "single",
				},
				height = 8,
				width = 50,
				row = 0.4,
				col = 0.48,
			},
		}

		local picker_opts = {
			header = false,
			file_icons = false,
			git_icons = false,
			color_icons = false,
		}
		Map("<leader>sa", function()
			fzf.builtin(Merge(builtin_opts, picker_opts))
		end, "FZF Builtin")

		Map("<leader><leader>", function()
			fzf.files(Merge(picker_opts, {
				cmd = "rg --files --hidden --ignore --glob='!.git' --sortr=modified",
				fzf_opts = { ["--scheme"] = "path", ["--tiebreak"] = "index" },
			}))
		end, "Search Files")

		Map("<leader>sr", function()
			fzf.resume(Merge(picker_opts, { winopts = { width = 0.80 } }))
		end, "FZF Search Resume")

		Map("<leader>sg", function()
			fzf.live_grep_native(Merge(picker_opts, {
				winopts = {
					width = 0.80,
					preview = { hidden = false, layout = "horizontal" },
				},
			}))
		end, "Live Grep")
		Map("<leader>dd", function()
			fzf.diagnostics_document(Merge(picker_opts))
		end)

		Map("<leader>st", function()
			fzf.colorschemes(Merge(picker_opts, builtin_opts))
		end, "Switch Theme")

		Map("<C-e>", function()
			require("fzf-lua.win").toggle_fullscreen()
			require("fzf-lua.win").toggle_preview()
		end, "Toggle FZF fullscreen", { "c", "i", "t" })

		-- LSP
		-- Disable defaults
		pcall(vim.keymap.del, "n", "gra")
		pcall(vim.keymap.del, "n", "gri")
		pcall(vim.keymap.del, "n", "grn")
		pcall(vim.keymap.del, "n", "grr")
		pcall(vim.keymap.del, "n", "grt")

		Map("<leader>rn", function()
			vim.lsp.buf.rename()
		end, "Rename")
		Map("gd", function()
			fzf.lsp_definitions({ jump1 = true })
		end, "Goto Definition")
		Map("gr", function()
			fzf.lsp_references({ jump1 = true })
		end, "Goto Reference")
		Map("gt", function()
			fzf.lsp_typedefs({ jump1 = true })
		end, "Goto Type Definition")
		Map("gD", function()
			fzf.lsp_implementations({ jump1 = true })
		end, "Goto Implementation")
		Map("gi", function()
			fzf.lsp_implementations({ jump1 = true })
		end, "Goto Implementation")
		Map("<leader>ds", function()
			fzf.lsp_document_symbols({ jump1 = true })
		end, "Goto Document Symbols")
	end,
}
