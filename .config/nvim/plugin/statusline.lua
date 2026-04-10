vim.g.qf_disable_statusline = 1
local H = {}
_G.Statusline = {}

H.hl = function(t)
	local parts = vim.tbl_map(function(item)
		if type(item) == "string" then
			return item
		else
			return string.format("%%#%s#%s%%*", item.hl, item.string)
		end
	end, t)
	return table.concat(parts, "")
end

H.modes = setmetatable({
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
H.mode_component = function()
	local mode = H.modes[vim.fn.mode()]
	return H.hl({
		{
			hl = mode.hl,
			string = string.format(" 󰊠 %s ", mode.short),
		},
	})
end

H.git_component = function()
	if not vim.b.gitsigns_head then
		return ""
	end

	return H.hl({
		{
			hl = "StatuslineGit",
			string = string.format(" %s ", vim.b.gitsigns_head),
		},
	})
end

H.filename_component = function()
	local bufname = vim.api.nvim_buf_get_name(0)
	if bufname == "" then
		return ""
	end

	local dirname = vim.fn.fnamemodify(bufname, ":.:h")
	local filename = vim.fn.fnamemodify(bufname, ":t")
	local ext = vim.fn.fnamemodify(bufname, ":e")

	local dirs = vim.split(dirname, "/")
	if #dirs > 3 then
		dirname = dirs[1] .. "/.../" .. dirs[#dirs]
	end

	local icon, icon_hl = "", ""
	local ok, devicons = pcall(require, "nvim-web-devicons")
	if ok then
		icon, icon_hl = devicons.get_icon(filename, ext, { default = true })
	end

	local path_str = H.hl({
		{ hl = "StatuslineNC", string = dirname .. "/" },
		{ hl = "ModeMsg", string = filename },
		{
			hl = "WarningMsg",
			string = "%m",
		},
	})

	return H.hl({
		" ",
		{ hl = icon_hl, string = icon },
		" ",
		path_str,
	})
end

H.search_count_component = function()
	if vim.v.hlsearch == 0 then
		return ""
	end
	local result = vim.fn.searchcount({ maxcount = 9999, timeout = 100 })
	if not result or result.total == 0 then
		return ""
	end
	return H.hl({
		{
			hl = "StatuslineSearch",
			string = string.format(" %d/%d ", result.current, result.total),
		},
	})
end

H.lsp_component = function()
	return H.hl({
		{
			hl = "StatuslineNC",
			string = vim.lsp.status(),
		},
	})
end

Statusline.render = function()
	return H.hl({
		H.mode_component(),
		H.git_component(),
		"%<",
		H.filename_component(),
		"%=",
		H.lsp_component(),
		H.search_count_component(),
		vim.diagnostic.status(),
		" %p󱉸",
		" %L",
	})
end

Statusline.setup_hl = function()
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
	set_default_hl("StatuslineModeNormal", { link = "Cursor", bold = true })
	set_default_hl("StatuslineModeInsert", { link = "DiffChange", bold = true })
	set_default_hl("StatuslineModeVisual", { link = "DiffAdd", bold = true })
	set_default_hl("StatuslineModeReplace", { link = "DiffDelete", bold = true })
	set_default_hl("StatuslineModeCommand", { link = "DiffText", bold = true })
	set_default_hl("StatuslineModeOther", { link = "IncSearch", bold = true })
	set_default_hl("StatuslineGit", { link = "Visual" })
	set_default_hl("StatuslineSearch", { link = "Search" })
	set_default_hl("StatuslineAI", { link = "Special", bold = true })
end

Statusline.setup_hl()

vim.o.statusline = "%{%v:lua.Statusline.render()%}"
