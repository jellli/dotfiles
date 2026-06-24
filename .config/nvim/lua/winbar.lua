local M = {}
local h = require("utils").hl
local get_icon = require("utils").get_buf_icon

M.filename_component = function()
	local bufname = vim.api.nvim_buf_get_name(0)
	if bufname == "" then
		return ""
	end
	local dirname = vim.fn.fnamemodify(bufname, ":.:h")
	local filename = vim.fn.fnamemodify(bufname, ":t")

	local dirs = vim.split(dirname, "/")
	if #dirs > 3 then
		dirname = dirs[1] .. "/.../" .. dirs[#dirs]
	end

	local icon, icon_hl = get_icon()

	local path_str = h({
		{ hl = "StatuslineNC", string = dirname .. "/" },
		{ hl = "ModeMsg", string = filename },
		{
			hl = "WarningMsg",
			string = "%m",
		},
	})

	return h({
		" ",
		{ hl = icon_hl, string = icon },
		" ",
		path_str,
	})
end

M.render = function()
	return h({
		vim.diagnostic.status(),
		"%=",
		"%<",
		M.filename_component(),
		h({ {
			hl = "Comment",
			string = " %L lines",
		} }),
	})
end

Jili.autocmd("BufWinEnter", {
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
