local M = {}
local h = require("utils").hl
local get_icon = require("utils").get_buf_icon

M.modes = setmetatable({
	["n"] = { long = "Normal", short = "N", hl = "StatuslineModeNormal" },
	["v"] = { long = "Visual", short = "V", hl = "StatuslineModeVisual" },
	["V"] = { long = "V-Line", short = "V", hl = "StatuslineModeVisual" },
	["s"] = { long = "Select", short = "S", hl = "StatuslineModeVisual" },
	["S"] = { long = "S-Line", short = "S", hl = "StatuslineModeVisual" },
	["i"] = { long = "Insert", short = "I", hl = "StatuslineModeInsert" },
	["R"] = { long = "Replace", short = "R", hl = "StatuslineModeReplace" },
	["c"] = { long = "Command", short = "C", hl = "StatuslineModeCommand" },
	["r"] = { long = "Prompt", short = "P", hl = "StatuslineModeOther" },
	["!"] = { long = "Shell", short = "Sh", hl = "StatuslineModeOther" },
	["t"] = { long = "Terminal", short = "T", hl = "StatuslineModeOther" },
}, {
	__index = function()
		return { long = "Unknown", short = "U", hl = "StatuslineModeOther" }
	end,
})

M.mode_component = function()
	local mode = M.modes[vim.fn.mode()]
	return h({
		{
			hl = mode.hl,
			string = string.format(" 󰊠 %s ", mode.short),
		},
	})
end

M.git_component = function()
	local dict = vim.b.gitsigns_status_dict
	if not dict then
		return ""
	end

	local info, added, changed, removed = "", "", "", ""

	if dict.head and dict.root then
		info = h({
			{
				hl = "Normal",
				string = string.format("%s ", vim.fn.fnamemodify(dict.root, ":t")),
			},
			{
				hl = "StatuslineNC",
				string = string.format(">  %s", dict.head),
			},
		})
	end
	if dict.added and dict.added > 0 then
		added = h({
			{
				hl = "StatuslineGitAdded",
				string = string.format(" +%s", dict.added),
			},
		})
	end
	if dict.changed and dict.changed > 0 then
		changed = h({
			{
				hl = "StatuslineGitChanged",
				string = string.format(" ~%s", dict.changed),
			},
		})
	end
	if dict.removed and dict.removed > 0 then
		removed = h({
			{
				hl = "StatuslineGitRemoved",
				string = string.format(" -%s", dict.removed),
			},
		})
	end

	local text = info .. added .. changed .. removed

	return h({
		{
			hl = "StatuslineGit",
			string = string.format(" %s", text),
		},
	})
end

M.search_count_component = function()
	if vim.v.hlsearch == 0 then
		return ""
	end
	local result = vim.fn.searchcount({ maxcount = 9999, timeout = 100 })
	if not result or result.total == 0 then
		return ""
	end
	return h({
		{
			hl = "StatuslineSearch",
			string = string.format("  %d/%d ", result.current or 0, result.total or 0),
		},
	})
end

local icon_hl_cache = {}
M.filetype_component = function()
	local icon, icon_hl = get_icon()
	local hl = vim.api.nvim_get_hl(0, { name = icon_hl })
	if next(hl) == nil then
		return ""
	end

	local hl_name = "StatuslineFiletype__" .. vim.bo.filetype
	if not icon_hl_cache[hl_name] then
		vim.api.nvim_set_hl(0, hl_name, {
			link = icon_hl,
			bold = true,
		})
		icon_hl_cache[hl_name] = true
	end
	return h({
		{
			hl = hl_name,
			string = string.format(" %s ", icon),
		},
		{
			hl = "Normal",
			string = vim.bo.filetype,
		},
	})
end

M.lsp_component = function()
	local lsp_msg = #vim.lsp.status() > 0 and " LSP: " .. vim.lsp.status() or ""
	local lsp_count = #vim.lsp.get_clients()
	return h({
		{
			hl = "StatuslineNC",
			string = string.format("  %d%s", lsp_count, lsp_msg),
		},
	})
end

M.macro_recording_component = function()
	local recording_register = vim.fn.reg_recording()
	if recording_register == "" then
		return ""
	else
		return h({
			{
				hl = "WarningMsg",
				string = " @" .. recording_register,
			},
		})
	end
end

M.render = function()
	return h({
		M.mode_component(),
		M.git_component(),
		M.lsp_component(),
		"%=",
		M.macro_recording_component(),
		"%=",
		M.filetype_component(),
		M.search_count_component(),
	})
end

M.setup_hl = vim.schedule_wrap(function()
	local set_default_hl = function(name, data)
		if data.link then
			local hl = vim.api.nvim_get_hl(0, { name = data.link })
			if not vim.tbl_isempty(hl) then
				for key, value in pairs(data) do
					hl[key] = value
				end
				hl.link = nil
				data = hl
			end
		end
		data.default = true
		vim.api.nvim_set_hl(0, name, data)
	end
	set_default_hl("StatuslineModeNormal", { link = "PmenuSel", bold = true })
	set_default_hl("StatuslineModeInsert", { link = "Substitute", bold = true })
	set_default_hl("StatuslineModeVisual", { link = "PmenuKind", bold = true })
	set_default_hl("StatuslineModeReplace", { link = "DiffDelete", bold = true })
	set_default_hl("StatuslineModeCommand", { link = "Cursor", bold = true })
	set_default_hl("StatuslineModeOther", { link = "IncSearch", bold = true })

	set_default_hl("StatuslineGitAdded", { link = "Green" })
	set_default_hl("StatuslineGitChanged", { link = "Yellow" })
	set_default_hl("StatuslineGitRemoved", { link = "Red" })

	set_default_hl("StatuslineSearch", { link = "Search" })
end)

local autocmd = Jili.autocmd

autocmd({
	"LspProgress",
}, {
	callback = function()
		vim.cmd("redrawstatus")
	end,
})

autocmd("User", {
	pattern = { "GitSignsUpdate" },
	callback = function()
		vim.cmd("redrawstatus")
	end,
})

autocmd("ColorScheme", {
	callback = M.setup_hl,
})

vim.g.qf_disable_statusline = 1
vim.o.laststatus = 3
vim.o.statusline = "%!v:lua.require'statusline'.render()"

M.setup_hl()

return M
