local merge = require("utils").merge

return {
	"ibhagwan/fzf-lua",
	dependencies = { "nvim-tree/nvim-web-devicons" },
	config = function()
		local zen_colors = require("kanso.colors").setup({ theme = "zen" })
		local fzf = require("fzf-lua")
		fzf.register_ui_select()

		fzf.setup({
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

				["hl"] = { "fg", "Constant" },
				["hl+"] = { "fg", "Constant" },
			},
			actions = {
				["ctrl-v"] = fzf.actions.file_vsplit,
				["ctrl-h"] = fzf.actions.file_split,
				["ctrl-q"] = fzf.actions.file_sel_to_qf,
				["enter"] = fzf.actions.file_edit_or_qf,
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
		local map = function(keys, picker, desc, mode)
			local command
			if type(picker) == "string" then
				command = function()
					fzf[picker](picker_opts)
				end
			elseif type(picker) == "function" then
				command = picker
			else
				error("Invalid picker type: must be a string or function")
			end
			vim.keymap.set(mode and mode or "n", keys, command, { desc = desc })
		end
		map("<leader>sa", function()
			fzf.builtin(merge(builtin_opts, picker_opts))
		end, "FZF")

		map("<leader><leader>", function()
			fzf.files(merge(picker_opts, {
				cmd = "rg --files --hidden --ignore --glob='!.git' --sortr=modified",
				fzf_opts = { ["--scheme"] = "path", ["--tiebreak"] = "index" },
			}))
		end, "Files")

		map("<leader>sg", function()
			fzf.live_grep_native(merge(picker_opts, {
				winopts = {
					width = 0.80,
					preview = { hidden = false, layout = "horizontal" },
				},
			}))
		end, "Grep Word")

		map("<leader>st", function()
			fzf.colorschemes(merge(picker_opts, builtin_opts))
		end, "Switch Theme")

		map("<C-e>", function()
			require("fzf-lua.win").toggle_fullscreen()
			require("fzf-lua.win").toggle_preview()
		end, "Toggle FZF fullscreen", { "c", "i", "t" })

		-- LSP
		map("gd", function()
			fzf.lsp_definitions({ jump1 = true })
		end)
		map("gr", function()
			fzf.lsp_references({ jump1 = true })
		end)
		-- map("ca", function()
		-- 	fzf.lsp_code_actions({ jump1 = true })
		-- end)
		map("ds", function()
			fzf.lsp_document_symbols({ jump1 = true })
		end)
	end,
}
