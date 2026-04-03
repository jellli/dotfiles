local function overide_gruvbox_color()
	local override = {
		Visual = { bg = "#433e39" },
		Directory = { link = "Special" },

		FloatBorder = { link = "Winseparator" },
		CursorLineNr = { link = "Red" },
		CurrentWord = { link = "Visual" },

		FlashMatch = { link = "DiagnosticWarn" },
		FlashCurrent = { link = "DiagnosticInfo" },
		FlashLabel = { link = "Cursor" },

		BlinkCmpMenu = { link = "StdoutMsg" },
		BlinkCmpMenuSelection = { link = "Visual" },

		BlinkCmpLabelDescription = { link = "Comment" },
		BlinkCmpSource = { link = "Comment" },
		BlinkCmpLabelMatch = { link = "FloatTitle" },

		BlinkCmpMenuBorder = { link = "FloatBorder" },
		BlinkCmpDocBorder = { link = "FloatBorder" },
		BlinkCmpSignatureHelpBorder = { link = "FloatBorder" },
		FzfLuaBorder = { link = "FloatBorder" },

		CodeCompanionChatInfoBanner = { link = "Substitute" },
	}
	for group, opts in pairs(override) do
		vim.api.nvim_set_hl(0, group, opts)
	end
end

Jili.autocmd("ColorScheme", {
	pattern = "gruvbox-material",
	callback = overide_gruvbox_color,
})

vim.pack.add({
	"https://github.com/nvim-tree/nvim-web-devicons",
	"https://github.com/sainnhe/gruvbox-material",
})

vim.g.gruvbox_material_background = "hard"
vim.g.gruvbox_material_foreground = "material"
vim.g.gruvbox_material_disable_italic_comment = 1
vim.g.gruvbox_material_enable_bold = 1
vim.g.gruvbox_material_transparent_background = 1
vim.g.gruvbox_material_dim_inactive_windows = 0
vim.g.gruvbox_material_visual = "reverse"
vim.g.gruvbox_material_float_style = "blend"
vim.g.gruvbox_material_cursor = "orange"
vim.g.gruvbox_material_diagnostic_text_highlight = 1
vim.g.gruvbox_material_diagnostic_line_highlight = 1
vim.g.gruvbox_material_diagnostic_virtual_text = "colored"
vim.g.gruvbox_material_inlay_hints_background = "dim"
vim.g.gruvbox_material_better_performance = 1
vim.cmd("colorscheme gruvbox-material")
