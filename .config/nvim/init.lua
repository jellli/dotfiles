vim.loader.enable()

_G.Jili = {}

local augroup = vim.api.nvim_create_augroup("UserConfig", { clear = true })
--- @param event vim.api.keyset.events|vim.api.keyset.events[] Event(s) that will trigger the handler (`callback` or `command`).
--- @param opts vim.api.keyset.create_autocmd Options dict:
Jili.autocmd = function(event, opts)
	local group = opts.group or augroup
	vim.api.nvim_create_autocmd(event, vim.tbl_extend("force", { group = group }, opts))
end
--
---@param mode string | string[]
---@param key string
---@param action string | function
---@param opts? vim.keymap.set.Opts | string
Jili.keymap = function(mode, key, action, opts)
	local o
	if type(opts) == "string" then
		o = { desc = opts, silent = true }
	elseif opts then
		o = vim.tbl_extend("force", { silent = true }, opts)
	else
		o = { silent = true }
	end
	vim.keymap.set(mode, key, action, o)
end
--
require("options")
require("keymaps")
require("autocmds")
vim.lsp.enable({
	"lua_ls",
	"tsgo",
	"cssls",
	"cssmodules_ls",
	"emmet_ls",
	"vimdoc_ls",
})

require("vim._core.ui2").enable({
	msg = {
		targets = "msg",
	},
})
