local mode_map = {
	["n"] = "NORMAL",
	["no"] = "OP-PENDING",
	["nov"] = "OP-PENDING",
	["noV"] = "OP-PENDING",
	["no\22"] = "OP-PENDING",
	["niI"] = "NORMAL",
	["niR"] = "NORMAL",
	["niV"] = "NORMAL",
	["nt"] = "NORMAL",
	["ntT"] = "NORMAL",
	["v"] = "VISUAL",
	["vs"] = "VISUAL",
	["V"] = "VISUAL",
	["Vs"] = "VISUAL",
	["\22"] = "VISUAL",
	["\22s"] = "VISUAL",
	["s"] = "SELECT",
	["S"] = "SELECT",
	["\19"] = "SELECT",
	["i"] = "INSERT",
	["ic"] = "INSERT",
	["ix"] = "INSERT",
	["R"] = "REPLACE",
	["Rc"] = "REPLACE",
	["Rx"] = "REPLACE",
	["Rv"] = "VIRT REPLACE",
	["Rvc"] = "VIRT REPLACE",
	["Rvx"] = "VIRT REPLACE",
	["c"] = "COMMAND",
	["cv"] = "VIM EX",
	["ce"] = "EX",
	["r"] = "PROMPT",
	["rm"] = "MORE",
	["r?"] = "CONFIRM",
	["!"] = "SHELL",
	["t"] = "TERMINAL",
}

Statusline = {}
Statusline.ns = vim.api.nvim_create_namespace("statusline")
Statusline.hls = {}

Statusline.lsp_progress_status = {
	client_id = nil,
	kind = nil,
	title = nil,
	message = nil,
	percentage = nil,
	indicator = nil,
}

Statusline.spinner = {
	symbols = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
	timer = nil,
	index = 1,
	processing = false,
}

Statusline.ai_spinner = {
	symbols = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
	timer = nil,
	index = 1,
	processing = false,
}

local H = {}

---@param name string
---@param opts vim.api.keyset.highlight
function H.create_hl(name, opts)
	if Statusline.hls[name] then
		return
	end
	vim.api.nvim_set_hl(0, name, opts)
	Statusline.hls[name] = true
end

function H.hl(hl_name, text)
	return string.format("%%#%s#%s%%*", hl_name, text)
end

local function mode()
	local prefix = H.hl("Cursor", " ")
	local m = H.hl("", mode_map[vim.api.nvim_get_mode().mode])
	return string.format("%s %s %s", prefix, "󰊠", m)
end

local filetype = function(bufnr)
	local ft = vim.bo[bufnr].filetype
	local success, devicons = pcall(require, "nvim-web-devicons")
	local icon_hl = ""
	if success then
		local icon, hl = devicons.get_icon(ft, vim.fn.fnamemodify(vim.fn.expand("%"), ":e"), { default = true })
		icon_hl = H.hl(hl, icon)
	end
	return string.format(" %s %s", icon_hl, H.hl("Type", ft))
end

local indicator_symbols = {
	"",
	"",
	"",
	"",
	"",
	"",
}

local function start_loading()
	if Statusline.spinner.timer then
		return
	end
	Statusline.spinner.timer = vim.uv.new_timer()
	local i = 1
	Statusline.spinner.timer:start(
		0,
		120,
		vim.schedule_wrap(function()
			Statusline.lsp_progress_status.indicator = i
			i = i % #indicator_symbols + 1
			vim.cmd("redrawstatus")
		end)
	)
end

local function stop_loading()
	if Statusline.spinner.timer then
		Statusline.spinner.timer:stop()
		Statusline.spinner.timer:close()
		Statusline.spinner.timer = nil
	end
	Statusline.lsp_progress_status.indicator = nil
end

local function start_ai_spinner()
	if Statusline.ai_spinner.timer then
		return
	end
	Statusline.ai_spinner.timer = vim.fn.timer_start(100, function()
		if Statusline.ai_spinner.processing then
			Statusline.ai_spinner.index = (Statusline.ai_spinner.index % #Statusline.ai_spinner.symbols) + 1
			vim.cmd("redrawstatus")
		else
			vim.fn.timer_stop(Statusline.ai_spinner.timer)
			Statusline.ai_spinner.timer = nil
		end
	end, { ["repeat"] = -1 })
end

local function stop_ai_spinner()
	if Statusline.ai_spinner.timer then
		vim.fn.timer_stop(Statusline.ai_spinner.timer)
		Statusline.ai_spinner.timer = nil
	end
	Statusline.ai_spinner.index = 1
end

local lsp_progress_group = vim.api.nvim_create_augroup("LspProgress", { clear = true })
vim.api.nvim_create_autocmd("LspProgress", {
	group = lsp_progress_group,
	pattern = { "begin", "end" },
	callback = function(ev)
		local value = ev.data.params.value
		if value.kind == "begin" then
			Statusline.lsp_progress_status = value
			Statusline.lsp_progress_status.client_id = ev.data.client_id
			start_loading()
		elseif value.kind == "end" then
			Statusline.lsp_progress_status = {
				client_id = nil,
				kind = nil,
				title = nil,
				message = nil,
				percentage = nil,
				indicator = nil,
			}
			stop_loading()
		end
	end,
})

local codecompanion_group = vim.api.nvim_create_augroup("CodeCompanionStatus", { clear = true })
vim.api.nvim_create_autocmd("User", {
	group = codecompanion_group,
	pattern = "CodeCompanionRequestStarted",
	callback = function()
		Statusline.ai_spinner.processing = true
		Statusline.ai_spinner.index = 1
		start_ai_spinner()
		vim.cmd("redrawstatus")
	end,
})
vim.api.nvim_create_autocmd("User", {
	group = codecompanion_group,
	pattern = "CodeCompanionRequestFinished",
	callback = function()
		Statusline.ai_spinner.processing = false
		stop_ai_spinner()
		vim.cmd("redrawstatus")
	end,
})

local function lsp_progress()
	local client = Statusline.lsp_progress_status.client_id
		and vim.lsp.get_client_by_id(Statusline.lsp_progress_status.client_id)
	local client_name = client and client.name and H.hl("ModeMsg", string.format(" %s %s", "", client.name)) or ""
	local indicator = Statusline.lsp_progress_status.indicator
			and indicator_symbols[Statusline.lsp_progress_status.indicator]
		or ""
	local title = H.hl("Comment", Statusline.lsp_progress_status.title or "")
	return string.format("%s %s %s", client_name, indicator, title)
end

local function git(bufnr)
	local git_info = vim.b[bufnr].gitsigns_status_dict
	if not git_info then
		return ""
	end

	local branch = H.hl("Visual", " " .. (git_info.head or "no branch") .. " ")
	local changes = {}

	if git_info.added and git_info.added > 0 then
		table.insert(changes, H.hl("GitSignsAdd", "+" .. git_info.added))
	end
	if git_info.changed and git_info.changed > 0 then
		table.insert(changes, H.hl("GitSignsChange", "~" .. git_info.changed))
	end
	if git_info.removed and git_info.removed > 0 then
		table.insert(changes, H.hl("GitSignsDelete", "-" .. git_info.removed))
	end

	local changes_str = ""
	if #changes > 0 then
		changes_str = H.hl("Comment", "[") .. table.concat(changes) .. H.hl("Comment", "]")
	end

	return string.format(" %s%s", branch, changes_str)
end

function Statusline.render_codecompanion(bufnr)
	local meta = _G.codecompanion_chat_metadata and _G.codecompanion_chat_metadata[bufnr]

	if not meta then
		return ""
	end

	local parts = {}

	if meta.adapter then
		local name = meta.adapter.name or "unknown"
		local model = meta.adapter.model and meta.adapter.model:sub(1, 12) or ""

		local icon = Statusline.ai_spinner.processing and Statusline.ai_spinner.symbols[Statusline.ai_spinner.index]
			or "󰚩"
		local adapter_part = H.hl("String", icon) .. " " .. H.hl("Comment", name)
		local model_part = model ~= "" and ": " .. H.hl("Title", model) or ""
		table.insert(parts, adapter_part .. model_part)
	end

	if meta.tokens and meta.tokens > 0 then
		table.insert(parts, H.hl("Number", "󰬁 " .. meta.tokens))
	end

	if meta.cycles and meta.cycles > 0 then
		table.insert(parts, H.hl("Comment", " " .. meta.cycles))
	end

	local right = H.hl("Special", "ID:" .. (meta.id or "?"))

	return table.concat(parts, "  ") .. "%=" .. right
end
local function get_smart_path()
	local bufnr = vim.api.nvim_get_current_buf()
	local path = vim.api.nvim_buf_get_name(bufnr)

	if path == "" then
		return " [No Name] "
	end

	local root = vim.fs.root(path, { ".git", "package.json", "go.mod" }) or vim.fn.getcwd()

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

	return string.format(" %s", rel_path)
end

vim.opt.statusline = "%!v:lua.my_statusline()"
function Statusline.render()
	local winnr = vim.g.statusline_winid or 0
	local bufnr = vim.api.nvim_win_get_buf(winnr)
	local ft = vim.bo[bufnr].filetype

	if ft == "codecompanion" then
		return Statusline.render_codecompanion(bufnr)
	end

	local excludes = { "fugitive", "minifiles" }
	if vim.tbl_contains(excludes, ft) then
		return ""
	end

	local is_current = winnr == vim.api.nvim_get_current_win()

	local parts = {}

	if is_current then
		table.insert(parts, mode())
		-- table.insert(parts, lsp_progress())
	end

	table.insert(parts, git(bufnr))
	table.insert(parts, get_smart_path())
	table.insert(parts, "%=")
	table.insert(parts, vim.diagnostic.status())
	table.insert(parts, vim.ui.progress_status())
	table.insert(parts, filetype(bufnr))

	return table.concat(parts)
end

H.create_hl("ModeNormal", { fg = "#000000", bg = "#ffffff" })
vim.o.statusline = "%!v:lua.Statusline.render()"

local update_group = vim.api.nvim_create_augroup("StatuslineUpdate", { clear = false })
vim.api.nvim_create_autocmd({
	"LspProgress",
	"ModeChanged",
}, {
	group = update_group,
	callback = function()
		vim.cmd("redrawstatus")
	end,
})
