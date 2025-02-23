if vim.g.vscode then
	-- VSCode extension
	local vscode = require("vscode")
	require("jili.config.vscode-lazy")
	vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
		vscode.with_insert(function()
			vscode.action("editor.action.addSelectionToNextFindMatch")
		end)
	end)
	require("jili.config.options")
	require("jili.config.remap")

	print("VSCodes")
else
	-- ordinary Neovim
	require("jili.config.options")
	require("jili.config.remap")
	require("jili.config.lazy")
	-- Highlight when yanking (copying) text
	--  Try it with `yap` in normal mode
	--  See `:help vim.highlight.on_yank()`
	-- vim.api.nvim_create_autocmd("TextYankPost", {
	-- 	desc = "Highlight when yanking (copying) text",
	-- 	group = vim.api.nvim_create_augroup("kickstart-highlight-yank", { clear = true }),
	-- 	callback = function()
	-- 		vim.highlight.on_yank()
	-- 	end,
	-- })
end
