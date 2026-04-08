local M = {}
local function truncate(str, max)
	if #str <= max then
		return str
	end
	return str:sub(1, max - 1) .. "…"
end
local function component(hl, content)
	if not content or content == "" then
		return ""
	end
	return string.format("%%#%s# %s %%*", hl, content)
end
local function icon_component(icon_hl, icon, text_hl, text)
	if not text or text == "" then
		return ""
	end
	return string.format("%%#%s#%s %%#%s#%s%%*", icon_hl, icon, text_hl, text)
end
M.mode = {
	map = {
		n = { label = "NORMAL", hl = "StatusLineModeNormal" },
		no = { label = "O-PENDING", hl = "StatusLineModeNormal" },
		nov = { label = "O-PENDING", hl = "StatusLineModeNormal" },
		noV = { label = "O-PENDING", hl = "StatusLineModeNormal" },
		["no\22"] = { label = "O-PENDING", hl = "StatusLineModeNormal" },
		niI = { label = "NORMAL", hl = "StatusLineModeNormal" },
		niR = { label = "NORMAL", hl = "StatusLineModeNormal" },
		niV = { label = "NORMAL", hl = "StatusLineModeNormal" },
		nt = { label = "NORMAL", hl = "StatusLineModeNormal" },
		ntT = { label = "NORMAL", hl = "StatusLineModeNormal" },
		i = { label = "INSERT", hl = "StatusLineModeInsert" },
		ic = { label = "INSERT", hl = "StatusLineModeInsert" },
		ix = { label = "INSERT", hl = "StatusLineModeInsert" },
		v = { label = "VISUAL", hl = "StatusLineModeVisual" },
		V = { label = "V-LINE", hl = "StatusLineModeVisual" },
		["\22"] = { label = "V-BLOCK", hl = "StatusLineModeVisual" },
		s = { label = "SELECT", hl = "StatusLineModeSelect" },
		S = { label = "S-LINE", hl = "StatusLineModeSelect" },
		["\19"] = { label = "S-BLOCK", hl = "StatusLineModeSelect" },
		R = { label = "REPLACE", hl = "StatusLineModeReplace" },
		Rc = { label = "REPLACE", hl = "StatusLineModeReplace" },
		Rx = { label = "REPLACE", hl = "StatusLineModeReplace" },
		Rv = { label = "V-REPLACE", hl = "StatusLineModeReplace" },
		c = { label = "COMMAND", hl = "StatusLineModeCommand" },
		cv = { label = "EX", hl = "StatusLineModeCommand" },
		ce = { label = "EX", hl = "StatusLineModeCommand" },
		r = { label = "PROMPT", hl = "StatusLineModeOther" },
		rm = { label = "MORE", hl = "StatusLineModeOther" },
		["r?"] = { label = "CONFIRM", hl = "StatusLineModeOther" },
		["!"] = { label = "SHELL", hl = "StatusLineModeOther" },
		t = { label = "TERMINAL", hl = "StatusLineModeOther" },
	},
	render = function()
		local current = vim.api.nvim_get_mode().mode
		local mode_info = M.mode.map[current] or { label = "UNKNOWN", hl = "StatusLineModeOther" }
		return component(mode_info.hl, mode_info.label)
	end,
}
M.filename = {
	render = function(bufnr)
		local path = vim.api.nvim_buf_get_name(bufnr)
		if path == "" then
			return ""
		end
		local root = vim.fs.root(path, { ".git", "package.json", "go.mod", "Cargo.toml" }) or vim.fn.getcwd()
		local rel_path = path:sub(#root + 2)
		local parts = vim.split(rel_path, "/")
		local n = #parts
		if n > 2 then
			local smart_parts = {}
			for i = 1, n - 2 do
				table.insert(smart_parts, parts[i]:sub(1, 1))
			end
			table.insert(smart_parts, parts[n - 1])
			table.insert(smart_parts, parts[n])
			rel_path = table.concat(smart_parts, "/")
		end
		return component("StatusLineFilename", truncate(rel_path, 50))
	end,
}
M.git = {
	render = function(bufnr)
		local git_info = vim.b[bufnr].gitsigns_status_dict
		if not git_info then
			return ""
		end
		local branch = git_info.head or ""
		if branch == "" then
			return ""
		end
		local changes = {}
		if git_info.added and git_info.added > 0 then
			table.insert(changes, string.format("%%#StatusLineGitAdd#+%d%%*", git_info.added))
		end
		if git_info.changed and git_info.changed > 0 then
			table.insert(changes, string.format("%%#StatusLineGitChange#~%d%%*", git_info.changed))
		end
		if git_info.removed and git_info.removed > 0 then
			table.insert(changes, string.format("%%#StatusLineGitDelete#-%d%%*", git_info.removed))
		end
		local changes_str = #changes > 0 and string.format(" %s", table.concat(changes, " ")) or ""
		return string.format("%%#StatusLineGit# %s %s%%*%s", "󰊢", branch, changes_str)
	end,
}
M.lsp_progress = {
	indicator_symbols = { "󱣴", "󱣵", "󱣶", "󱣷", "󱣸", "󱣹" },
	status = {
		client_id = nil,
		title = nil,
		indicator = nil,
	},
	timer = nil,
	start = function()
		if M.lsp_progress.timer then
			return
		end
		M.lsp_progress.timer = vim.uv.new_timer()
		local i = 1
		M.lsp_progress.timer:start(
			0,
			120,
			vim.schedule_wrap(function()
				M.lsp_progress.status.indicator = i
				i = i % #M.lsp_progress.indicator_symbols + 1
				vim.cmd("redrawstatus")
			end)
		)
	end,
	stop = function()
		if M.lsp_progress.timer then
			M.lsp_progress.timer:stop()
			M.lsp_progress.timer:close()
			M.lsp_progress.timer = nil
		end
		M.lsp_progress.status = { client_id = nil, title = nil, indicator = nil }
	end,
	render = function()
		local status = M.lsp_progress.status
		if not status.client_id then
			return ""
		end
		local client = vim.lsp.get_client_by_id(status.client_id)
		if not client then
			return ""
		end
		local indicator = status.indicator and M.lsp_progress.indicator_symbols[status.indicator] or ""
		local title = status.title or ""
		return string.format("%%#StatusLineLspProgress# %s %s: %s %%*", "󰪚", client.name, indicator .. title)
	end,
}
vim.api.nvim_create_autocmd("LspProgress", {
	group = vim.api.nvim_create_augroup("StatusLineLspProgress", { clear = true }),
	callback = function(ev)
		local value = ev.data.params.value
		if value.kind == "begin" then
			M.lsp_progress.status.client_id = ev.data.client_id
			M.lsp_progress.status.title = value.title
			M.lsp_progress.start()
		elseif value.kind == "end" then
			M.lsp_progress.stop()
		end
		vim.cmd("redrawstatus")
	end,
})
M.diagnostics = {
	render = function(bufnr)
		local diags = vim.diagnostic.get(bufnr, { severity = vim.diagnostic.severity })
		local errors = #vim.tbl_filter(function(d)
			return d.severity == 1
		end, diags)
		local warnings = #vim.tbl_filter(function(d)
			return d.severity == 2
		end, diags)
		local hints = #vim.tbl_filter(function(d)
			return d.severity == 3
		end, diags)
		local info = #vim.tbl_filter(function(d)
			return d.severity == 4
		end, diags)
		if errors == 0 and warnings == 0 and hints == 0 and info == 0 then
			return ""
		end
		local parts = {}
		if errors > 0 then
			table.insert(parts, string.format("%%#StatusLineDiagError# %d%%*", errors))
		end
		if warnings > 0 then
			table.insert(parts, string.format("%%#StatusLineDiagWarn# %d%%*", warnings))
		end
		if hints > 0 then
			table.insert(parts, string.format("%%#StatusLineDiagHint# %d%%*", hints))
		end
		if info > 0 then
			table.insert(parts, string.format("%%#StatusLineDiagInfo# %d%%*", info))
		end
		return " " .. table.concat(parts, " ")
	end,
}
M.filetype = {
	render = function(bufnr)
		local ft = vim.bo[bufnr].filetype
		if ft == "" then
			return ""
		end
		local ok, devicons = pcall(require, "nvim-web-devicons")
		if not ok then
			return component("StatusLineFiletype", ft)
		end
		local icon, hl = devicons.get_icon(ft, vim.fn.fnamemodify(vim.fn.expand("%"), ":e"), { default = true })
		if not icon then
			return component("StatusLineFiletype", ft)
		end
		return string.format("%%#%s#%s %%#StatusLineFiletype#%s%%*", hl, icon, ft)
	end,
}
M.search_count = {
	render = function()
		if vim.v.hlsearch == 0 then
			return ""
		end
		local result = vim.fn.searchcount({ maxcount = 9999, timeout = 100 })
		if not result or result.total == 0 then
			return ""
		end
		return string.format("%%#StatusLineSearch# %d/%d %%*", result.current, result.total)
	end,
}
M.codecompanion = {
	ai_spinner = {
		symbols = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
		timer = nil,
		index = 1,
		processing = false,
	},
	start_timer = function()
		if M.codecompanion.ai_spinner.timer then
			return
		end
		M.codecompanion.ai_spinner.timer = vim.fn.timer_start(100, function()
			if M.codecompanion.ai_spinner.processing then
				M.codecompanion.ai_spinner.index = (
					M.codecompanion.ai_spinner.index % #M.codecompanion.ai_spinner.symbols
				) + 1
				vim.cmd("redrawstatus")
			else
				vim.fn.timer_stop(M.codecompanion.ai_spinner.timer)
				M.codecompanion.ai_spinner.timer = nil
			end
		end, { ["repeat"] = -1 })
	end,
	stop_timer = function()
		if M.codecompanion.ai_spinner.timer then
			vim.fn.timer_stop(M.codecompanion.ai_spinner.timer)
			M.codecompanion.ai_spinner.timer = nil
		end
		M.codecompanion.ai_spinner.index = 1
	end,
	render = function(bufnr)
		local meta = _G.codecompanion_chat_metadata and _G.codecompanion_chat_metadata[bufnr]
		if not meta then
			return ""
		end
		local parts = {}
		if meta.adapter then
			local spinner = M.codecompanion.ai_spinner.processing
					and M.codecompanion.ai_spinner.symbols[M.codecompanion.ai_spinner.index]
				or "󰚩"
			local model = meta.adapter.model and truncate(meta.adapter.model, 15) or ""
			table.insert(
				parts,
				string.format("%%#StatusLineAI#%s %%#StatusLineAIText#%s%%*", spinner, meta.adapter.name)
			)
			if model ~= "" then
				table.insert(parts, string.format("%%#StatusLineAIModel#%s%%*", model))
			end
		end
		if meta.tokens and meta.tokens > 0 then
			table.insert(parts, string.format("%%#StatusLineAITokens#󰬁 %d%%*", meta.tokens))
		end
		if meta.cycles and meta.cycles > 0 then
			table.insert(parts, string.format("%%#StatusLineAICycles# %d%%*", meta.cycles))
		end
		if #parts == 0 then
			return ""
		end
		return " " .. table.concat(parts, " ") .. " "
	end,
}
vim.api.nvim_create_autocmd("User", {
	group = vim.api.nvim_create_augroup("StatusLineCodeCompanion", { clear = true }),
	pattern = "CodeCompanionRequestStarted",
	callback = function()
		M.codecompanion.ai_spinner.processing = true
		M.codecompanion.ai_spinner.index = 1
		M.codecompanion.start_timer()
		vim.cmd("redrawstatus")
	end,
})
vim.api.nvim_create_autocmd("User", {
	group = vim.api.nvim_create_augroup("StatusLineCodeCompanion", { clear = false }),
	pattern = "CodeCompanionRequestFinished",
	callback = function()
		M.codecompanion.ai_spinner.processing = false
		M.codecompanion.stop_timer()
		vim.cmd("redrawstatus")
	end,
})
local function setup_highlights()
	local highlights = {
		StatusLineModeNormal = { bg = "#5080c0", fg = "#c0c0c0", bold = true },
		StatusLineModeInsert = { bg = "#50c080", fg = "#c0c0c0", bold = true },
		StatusLineModeVisual = { bg = "#c08050", fg = "#c0c0c0", bold = true },
		StatusLineModeSelect = { bg = "#c080c0", fg = "#c0c0c0", bold = true },
		StatusLineModeReplace = { bg = "#c05050", fg = "#c0c0c0", bold = true },
		StatusLineModeCommand = { bg = "#8050c0", fg = "#c0c0c0", bold = true },
		StatusLineModeOther = { bg = "#606060", fg = "#c0c0c0", bold = true },
		StatusLineFilename = { bg = "#3a3a3a", fg = "#b0b0b0" },
		StatusLineGit = { bg = "#3a3a3a", fg = "#80c080" },
		StatusLineGitAdd = { bg = "#3a3a3a", fg = "#80c080" },
		StatusLineGitChange = { bg = "#3a3a3a", fg = "#c0c080" },
		StatusLineGitDelete = { bg = "#3a3a3a", fg = "#c08080" },
		StatusLineLspProgress = { bg = "#3a3a3a", fg = "#80b0c0" },
		StatusLineDiagError = { bg = "#503030", fg = "#c05050" },
		StatusLineDiagWarn = { bg = "#504030", fg = "#c0a050" },
		StatusLineDiagHint = { bg = "#304050", fg = "#50a0c0" },
		StatusLineDiagInfo = { bg = "#304550", fg = "#50a0a0" },
		StatusLineFiletype = { bg = "#3a3a3a", fg = "#909090" },
		StatusLineSearch = { bg = "#3a503a", fg = "#80c080" },
		StatusLineAI = { bg = "#404060", fg = "#a090c0" },
		StatusLineAIText = { bg = "#404060", fg = "#c0b0d0" },
		StatusLineAIModel = { bg = "#404060", fg = "#9080b0" },
		StatusLineAITokens = { bg = "#404060", fg = "#80c080" },
		StatusLineAICycles = { bg = "#404060", fg = "#909090" },
	}
	for name, opts in pairs(highlights) do
		vim.api.nvim_set_hl(0, name, opts)
	end
end
-- setup_highlights()
vim.api.nvim_create_autocmd("ColorScheme", { callback = setup_highlights })
function M.render()
	local winnr = vim.g.statusline_winid or 0
	local bufnr = vim.api.nvim_win_get_buf(winnr)
	local ft = vim.bo[bufnr].filetype
	if ft == "codecompanion" then
		return M.codecompanion.render(bufnr)
	end
	if vim.tbl_contains({ "fugitive", "minifiles", "mason", "lazy", "help" }, ft) then
		return ""
	end
	local left = {}
	local is_current = winnr == vim.api.nvim_get_current_win()
	if is_current then
		table.insert(left, M.mode.render())
		table.insert(left, M.lsp_progress.render())
	end
	table.insert(left, M.filename.render(bufnr))
	table.insert(left, M.git.render(bufnr))
	local right = {}
	table.insert(right, M.search_count.render())
	table.insert(right, M.diagnostics.render(bufnr))
	table.insert(right, M.filetype.render(bufnr))
	local left_str = table.concat(
		vim.tbl_filter(function(s)
			return s ~= ""
		end, left),
		""
	)
	local right_str = table.concat(
		vim.tbl_filter(function(s)
			return s ~= ""
		end, right),
		""
	)
	if left_str == "" and right_str == "" then
		return ""
	end
	return left_str .. "%=" .. right_str
end
-- _G.Statusline = M
-- vim.o.statusline = "%!v:lua.Statusline.render()"
