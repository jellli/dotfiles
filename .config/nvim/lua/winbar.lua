local M = {}
local h = require("utils").hl
local get_icon = require("utils").get_buf_icon
local set_default_hl = require("utils").set_default_hl

M.filename_component = function()
	local bufname = vim.api.nvim_buf_get_name(0)
	if bufname == "" then
		return ""
	end
	local dirname = vim.fn.fnamemodify(bufname, ":.:h")
	local filename = vim.fn.fnamemodify(bufname, ":t")

	local icon, icon_hl = get_icon()

	local path_str = h({
		{ hl = "WinbarFilename", string = " " .. dirname .. "/" },
		{ hl = icon_hl, string = string.format("%s ", icon) },
		{ hl = "ModeMsg", string = filename },
		{
			hl = "WarningMsg",
			string = "%m",
		},
	})

	return h({
		path_str,
	})
end

M.render = function()
	return h({
		"%<",
		M.filename_component(),
		" ",
		vim.diagnostic.status(),
		" ",
		"%=",
		h({ {
			hl = "Comment",
			string = "%L lines",
		} }),
	})
end

M.setup_hl = vim.schedule_wrap(function()
	set_default_hl("Winbar", { bold = false })
	set_default_hl("WinbarFilename", { link = "WinbarNC", bold = false })
end)
local autocmd = Jili.autocmd

autocmd("ColorScheme", {
	callback = M.setup_hl,
})

autocmd("BufWinEnter", {
	callback = function(args)
		if
			vim.api.nvim_win_get_config(0).relative == "" -- For non-floating windows, `relative` is empty.
			and vim.bo[args.buf].buftype == "" -- Normal buffer
			and vim.api.nvim_buf_get_name(args.buf) ~= "" -- Has a file name
		then
			vim.wo.winbar = "%{%v:lua.require'winbar'.render()%}"
		end
	end,
})

return M
